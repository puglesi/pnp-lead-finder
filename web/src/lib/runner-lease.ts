import type { CampaignProfileId } from "../types/campaign-profile.ts";

export const RUNNER_LEASE_TTL_MS = 90_000;
export const RUNNER_OWNER_STORAGE_KEY = "pnp-agent-three-owner";
export const RUNNER_ALREADY_ACTIVE_MESSAGE =
  "RUNNER_ALREADY_ACTIVE — outro Agente 3 já está em execução nesta operação.";

export type RunnerLeaseDecision = "claimed" | "already_active";

export function runnerLockName(operation: CampaignProfileId | string): string {
  return `pnp-agent-three-runner:${operation}`;
}

export function decideRunnerLeaseClaim(input: {
  existingOwnerId?: string | null;
  expiresAt?: string | null;
  requesterOwnerId: string;
  nowIso: string;
}): RunnerLeaseDecision {
  if (!input.existingOwnerId) return "claimed";
  if (input.existingOwnerId === input.requesterOwnerId) return "claimed";
  if (!input.expiresAt || input.expiresAt <= input.nowIso) return "claimed";
  return "already_active";
}

export interface AgentThreeWebLock {
  acquired: boolean;
  release: () => void;
}

export interface AgentThreeWebLockAdapter {
  acquire(name: string): Promise<AgentThreeWebLock>;
}

export function createMemoryRunnerLockAdapter(): AgentThreeWebLockAdapter {
  const held = new Set<string>();
  return {
    async acquire(name) {
      if (held.has(name)) {
        return { acquired: false, release: () => {} };
      }
      held.add(name);
      return {
        acquired: true,
        release: () => {
          held.delete(name);
        },
      };
    },
  };
}

function browserWebLockAdapter(): AgentThreeWebLockAdapter {
  return {
    async acquire(name) {
      const locks = (
        globalThis as {
          navigator?: {
            locks?: {
              request: (
                lockName: string,
                options: { ifAvailable: boolean; mode: "exclusive" },
                callback: (lock: unknown) => Promise<void> | void
              ) => Promise<unknown>;
            };
          };
        }
      ).navigator?.locks;
      if (!locks?.request) {
        return { acquired: true, release: () => {} };
      }
      let release = () => {};
      const acquired = await new Promise<boolean>((resolve) => {
        void locks.request(
          name,
          { ifAvailable: true, mode: "exclusive" },
          (lock) => {
            if (!lock) {
              resolve(false);
              return;
            }
            resolve(true);
            return new Promise<void>((unlock) => {
              release = unlock;
            });
          }
        );
      });
      return { acquired, release };
    },
  };
}

export async function acquireAgentThreeWebLock(
  operation: CampaignProfileId | string,
  adapter: AgentThreeWebLockAdapter = browserWebLockAdapter()
): Promise<AgentThreeWebLock> {
  return adapter.acquire(runnerLockName(operation));
}

export function getOrCreateAgentThreeOwnerId(
  storage?: Pick<Storage, "getItem" | "setItem"> | null
): string {
  const fallback = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const target =
    storage === undefined
      ? typeof window !== "undefined"
        ? window.sessionStorage
        : null
      : storage;
  if (!target) return fallback();
  try {
    const existing = target.getItem(RUNNER_OWNER_STORAGE_KEY);
    if (existing && existing.trim()) return existing;
    const created = fallback();
    target.setItem(RUNNER_OWNER_STORAGE_KEY, created);
    return created;
  } catch {
    return fallback();
  }
}

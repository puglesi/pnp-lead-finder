import type { AgentThreeOperationState } from "./agent-three-queue.ts";

export type AgentThreeDelay = (
  milliseconds: number,
  signal: AbortSignal
) => Promise<void>;

export interface AgentThreeIntervalDependencies {
  delay: AgentThreeDelay;
  random: () => number;
}

export interface AgentThreeIntervalWaitResult {
  intervalSeconds: number;
  interrupted: boolean;
}

export function selectAgentThreeIntervalSeconds(
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
  random: () => number
): number {
  if (
    !Number.isFinite(minIntervalSeconds) ||
    !Number.isFinite(maxIntervalSeconds) ||
    minIntervalSeconds < 0 ||
    maxIntervalSeconds < minIntervalSeconds
  ) {
    throw new RangeError("Intervalo de envio inválido.");
  }
  const randomValue = Math.min(1, Math.max(0, random()));
  return (
    minIntervalSeconds +
    (maxIntervalSeconds - minIntervalSeconds) * randomValue
  );
}

export async function waitForAgentThreeInterval(
  operation: AgentThreeOperationState,
  dependencies: AgentThreeIntervalDependencies,
  signal: AbortSignal
): Promise<AgentThreeIntervalWaitResult> {
  const intervalSeconds = selectAgentThreeIntervalSeconds(
    operation.minIntervalSeconds,
    operation.maxIntervalSeconds,
    dependencies.random
  );
  if (signal.aborted) {
    return { intervalSeconds, interrupted: true };
  }
  try {
    await dependencies.delay(intervalSeconds * 1_000, signal);
  } catch (error) {
    if (signal.aborted) {
      return { intervalSeconds, interrupted: true };
    }
    throw error;
  }
  return { intervalSeconds, interrupted: signal.aborted };
}

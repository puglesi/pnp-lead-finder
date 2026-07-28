export type AgentOneStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "error";

export type AgentOneSectorStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "error";

export interface AgentOneSectorItem {
  id: string;
  sector: string;
  location: string;
  targetLeadCount: number;
  status: AgentOneSectorStatus;
  foundLeadCount: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentOneSnapshot {
  status: AgentOneStatus;
  queue: AgentOneSectorItem[];
  currentSectorId: string | null;
  errorMessage: string | null;
}

export interface AgentOneSectorInput {
  sector: string;
  location: string;
  targetLeadCount: number;
}

export interface ClaimedAgentOneSector {
  snapshot: AgentOneSnapshot;
  sector: AgentOneSectorItem | null;
}

export const INITIAL_AGENT_ONE_SNAPSHOT: AgentOneSnapshot = {
  status: "idle",
  queue: [],
  currentSectorId: null,
  errorMessage: null,
};

const AGENT_STATUSES = new Set<AgentOneStatus>([
  "idle",
  "running",
  "paused",
  "stopped",
  "completed",
  "error",
]);

const SECTOR_STATUSES = new Set<AgentOneSectorStatus>([
  "pending",
  "running",
  "paused",
  "completed",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentOneStatus(value: unknown): value is AgentOneStatus {
  return typeof value === "string" && AGENT_STATUSES.has(value as AgentOneStatus);
}

function isSectorStatus(value: unknown): value is AgentOneSectorStatus {
  return (
    typeof value === "string" &&
    SECTOR_STATUSES.has(value as AgentOneSectorStatus)
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isSectorItem(value: unknown): value is AgentOneSectorItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.sector === "string" &&
    typeof value.location === "string" &&
    typeof value.targetLeadCount === "number" &&
    Number.isFinite(value.targetLeadCount) &&
    isSectorStatus(value.status) &&
    typeof value.foundLeadCount === "number" &&
    Number.isFinite(value.foundLeadCount) &&
    typeof value.createdAt === "string" &&
    isOptionalString(value.errorMessage) &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.completedAt)
  );
}

function sanitizedInput(input: AgentOneSectorInput): AgentOneSectorInput {
  return {
    sector: input.sector.trim(),
    location: input.location.trim(),
    targetLeadCount: Math.max(1, Math.floor(input.targetLeadCount)),
  };
}

function isEditable(item: AgentOneSectorItem): boolean {
  return item.status === "pending" && item.startedAt === undefined;
}

export function addAgentOneSector(
  snapshot: AgentOneSnapshot,
  input: AgentOneSectorInput,
  id: string,
  createdAt: string
): AgentOneSnapshot {
  const nextInput = sanitizedInput(input);
  if (!nextInput.sector || !nextInput.location) return snapshot;

  return {
    ...snapshot,
    queue: [
      ...snapshot.queue,
      {
        id,
        ...nextInput,
        status: "pending",
        foundLeadCount: 0,
        createdAt,
      },
    ],
  };
}

export function updateAgentOneSector(
  snapshot: AgentOneSnapshot,
  id: string,
  input: AgentOneSectorInput
): AgentOneSnapshot {
  const nextInput = sanitizedInput(input);
  if (!nextInput.sector || !nextInput.location) return snapshot;

  return {
    ...snapshot,
    queue: snapshot.queue.map((item) =>
      item.id === id && isEditable(item)
        ? { ...item, ...nextInput }
        : item
    ),
  };
}

export function removeAgentOneSector(
  snapshot: AgentOneSnapshot,
  id: string
): AgentOneSnapshot {
  const item = snapshot.queue.find((candidate) => candidate.id === id);
  if (!item || !isEditable(item)) return snapshot;

  return {
    ...snapshot,
    queue: snapshot.queue.filter((candidate) => candidate.id !== id),
  };
}

export function startAgentOne(snapshot: AgentOneSnapshot): AgentOneSnapshot {
  const hasWork = snapshot.queue.some(
    (item) => item.status === "pending" || item.status === "paused"
  );
  if (!hasWork) return snapshot;

  return {
    ...snapshot,
    status: "running",
    currentSectorId: null,
    errorMessage: null,
    queue: snapshot.queue.map((item) =>
      item.status === "paused" ? { ...item, status: "pending" } : item
    ),
  };
}

export function pauseAgentOne(snapshot: AgentOneSnapshot): AgentOneSnapshot {
  if (snapshot.status !== "running") return snapshot;

  return {
    ...snapshot,
    status: "paused",
    queue: snapshot.queue.map((item) =>
      item.id === snapshot.currentSectorId && item.status === "running"
        ? { ...item, status: "paused" }
        : item
    ),
  };
}

export function resumeAgentOne(
  snapshot: AgentOneSnapshot,
  currentSearchIsActive = false
): AgentOneSnapshot {
  if (snapshot.status !== "paused") return snapshot;

  if (currentSearchIsActive && snapshot.currentSectorId) {
    return {
      ...snapshot,
      status: "running",
      queue: snapshot.queue.map((item) =>
        item.id === snapshot.currentSectorId && item.status === "paused"
          ? { ...item, status: "running" }
          : item
      ),
    };
  }

  return {
    ...snapshot,
    status: "running",
    currentSectorId: null,
    queue: snapshot.queue.map((item) =>
      item.status === "paused" ? { ...item, status: "pending" } : item
    ),
  };
}

export function stopAgentOne(snapshot: AgentOneSnapshot): AgentOneSnapshot {
  if (snapshot.status !== "running" && snapshot.status !== "paused") {
    return snapshot;
  }

  return {
    ...snapshot,
    status: "stopped",
    queue: snapshot.queue.map((item) =>
      item.id === snapshot.currentSectorId &&
      (item.status === "running" || item.status === "paused")
        ? { ...item, status: "paused" }
        : item
    ),
  };
}

export function claimNextAgentOneSector(
  snapshot: AgentOneSnapshot,
  startedAt: string
): ClaimedAgentOneSector {
  if (
    snapshot.status !== "running" ||
    snapshot.currentSectorId !== null ||
    snapshot.queue.some((item) => item.status === "running")
  ) {
    return { snapshot, sector: null };
  }

  const next = snapshot.queue.find((item) => item.status === "pending");
  if (!next) return { snapshot, sector: null };

  const claimed: AgentOneSectorItem = {
    ...next,
    status: "running",
    startedAt: next.startedAt ?? startedAt,
    errorMessage: undefined,
  };

  return {
    snapshot: {
      ...snapshot,
      currentSectorId: claimed.id,
      queue: snapshot.queue.map((item) =>
        item.id === claimed.id ? claimed : item
      ),
    },
    sector: claimed,
  };
}

export function completeAgentOneSector(
  snapshot: AgentOneSnapshot,
  id: string,
  foundLeadCount: number,
  completedAt: string
): AgentOneSnapshot {
  return {
    ...snapshot,
    currentSectorId:
      snapshot.currentSectorId === id ? null : snapshot.currentSectorId,
    queue: snapshot.queue.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "completed",
            foundLeadCount: Math.min(
              item.targetLeadCount,
              Math.max(
                item.foundLeadCount,
                Math.max(0, Math.floor(foundLeadCount))
              )
            ),
            errorMessage: undefined,
            completedAt,
          }
        : item
    ),
  };
}

export function failAgentOneSector(
  snapshot: AgentOneSnapshot,
  id: string,
  errorMessage: string,
  completedAt: string
): AgentOneSnapshot {
  return {
    ...snapshot,
    currentSectorId:
      snapshot.currentSectorId === id ? null : snapshot.currentSectorId,
    queue: snapshot.queue.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "error",
            errorMessage,
            completedAt,
          }
        : item
    ),
  };
}

export function finishAgentOne(snapshot: AgentOneSnapshot): AgentOneSnapshot {
  if (snapshot.status !== "running") return snapshot;

  const hasWork = snapshot.queue.some(
    (item) =>
      item.status === "pending" ||
      item.status === "running" ||
      item.status === "paused"
  );
  if (hasWork) return snapshot;

  return {
    ...snapshot,
    status: "completed",
    currentSectorId: null,
  };
}

export function failAgentOne(
  snapshot: AgentOneSnapshot,
  errorMessage: string
): AgentOneSnapshot {
  return {
    ...snapshot,
    status: "error",
    currentSectorId: null,
    errorMessage,
    queue: snapshot.queue.map((item) =>
      item.status === "running"
        ? { ...item, status: "error", errorMessage }
        : item
    ),
  };
}

export function selectPersistedAgentOneSnapshot(
  snapshot: AgentOneSnapshot
): AgentOneSnapshot {
  return {
    status: snapshot.status,
    queue: snapshot.queue,
    currentSectorId: snapshot.currentSectorId,
    errorMessage: snapshot.errorMessage,
  };
}

export function getAgentOneFoundLeadTotal(
  queue: AgentOneSectorItem[]
): number {
  return queue.reduce((total, item) => total + item.foundLeadCount, 0);
}

export function normalizeAgentOneSnapshot(
  persisted: unknown
): AgentOneSnapshot {
  if (!isRecord(persisted)) return INITIAL_AGENT_ONE_SNAPSHOT;

  const queue = Array.isArray(persisted.queue)
    ? persisted.queue.filter(isSectorItem)
    : [];
  const persistedStatus = isAgentOneStatus(persisted.status)
    ? persisted.status
    : "idle";
  const interrupted = persistedStatus === "running";
  const normalizedQueue = queue.map((item) => {
    const normalizedItem: AgentOneSectorItem = {
      ...item,
      targetLeadCount: Math.max(1, Math.floor(item.targetLeadCount)),
      foundLeadCount: Math.min(
        Math.max(1, Math.floor(item.targetLeadCount)),
        Math.max(0, Math.floor(item.foundLeadCount))
      ),
    };

    return interrupted && normalizedItem.status === "running"
      ? { ...normalizedItem, status: "paused" as const }
      : normalizedItem;
  });
  const currentSectorId =
    typeof persisted.currentSectorId === "string" &&
    normalizedQueue.some((item) => item.id === persisted.currentSectorId)
      ? persisted.currentSectorId
      : null;

  return {
    status: interrupted ? "paused" : persistedStatus,
    queue: normalizedQueue,
    currentSectorId,
    errorMessage:
      typeof persisted.errorMessage === "string"
        ? persisted.errorMessage
        : null,
  };
}

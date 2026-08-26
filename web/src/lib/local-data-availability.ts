import type { LocalDataAvailability } from "../types/local-data.ts";

export type { LocalDataAvailability };

export const LOCAL_DATA_HEALTH_CHANGE_EVENT = "pnp-local-data-health-change";

export const LOCAL_DATA_UNAVAILABLE_MESSAGE =
  "Banco local indisponível. Alterações e envios estão temporariamente bloqueados.";

export const LOCAL_DATA_CHECKING_MESSAGE = "Verificando banco local...";

export const LOCAL_DATA_UNAVAILABLE_ERROR_NAME = "LocalDataUnavailableError";

export interface LocalDataHealthProbeResult {
  ok?: boolean;
  writable?: boolean;
  status?: string;
  message?: string;
}

type HealthProbe = () => Promise<LocalDataHealthProbeResult>;

export class LocalDataUnavailableError extends Error {
  readonly code = "LOCAL_DATA_UNAVAILABLE";
  readonly availability: LocalDataAvailability;

  constructor(
    availability: LocalDataAvailability = "unavailable",
    message = LOCAL_DATA_UNAVAILABLE_MESSAGE
  ) {
    super(message);
    this.name = LOCAL_DATA_UNAVAILABLE_ERROR_NAME;
    this.availability = availability;
  }
}

export function isLocalDataUnavailableError(
  error: unknown
): error is LocalDataUnavailableError {
  if (error instanceof LocalDataUnavailableError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === LOCAL_DATA_UNAVAILABLE_ERROR_NAME) return true;
  return /banco local indispon[ií]vel/i.test(error.message);
}

function defaultHealthProbe(): Promise<LocalDataHealthProbeResult> {
  return fetch("/api/local-data/health", { cache: "no-store" }).then(
    async (response) => {
      const body = (await response.json().catch(() => null)) as
        | LocalDataHealthProbeResult
        | null;
      if (!body || typeof body !== "object") {
        throw new Error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
      }
      return body;
    }
  );
}

let availability: LocalDataAvailability = "checking";
let lastMessage = LOCAL_DATA_CHECKING_MESSAGE;
let inFlight: Promise<LocalDataAvailability> | null = null;
let probeImpl: HealthProbe = defaultHealthProbe;
const listeners = new Set<() => void>();

export function getLocalDataAvailability(): LocalDataAvailability {
  return availability;
}

export function getLocalDataAvailabilityMessage(): string {
  return lastMessage;
}

export function subscribeLocalDataAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitAvailability(): void {
  for (const listener of listeners) listener();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LOCAL_DATA_HEALTH_CHANGE_EVENT, {
      detail: {
        status: availability,
        ok: availability === "available",
        message: lastMessage,
      },
    })
  );
}

export function setLocalDataAvailability(
  next: LocalDataAvailability,
  message?: string
): void {
  const resolvedMessage =
    message ??
    (next === "available"
      ? ""
      : next === "checking"
        ? LOCAL_DATA_CHECKING_MESSAGE
        : LOCAL_DATA_UNAVAILABLE_MESSAGE);
  if (availability === next && lastMessage === resolvedMessage) return;
  availability = next;
  lastMessage = resolvedMessage;
  emitAvailability();
}

export function setLocalDataWritable(writable: boolean): void {
  setLocalDataAvailability(
    writable ? "available" : "unavailable",
    writable ? "" : LOCAL_DATA_UNAVAILABLE_MESSAGE
  );
}

export function isWritableHealth(
  health: LocalDataHealthProbeResult | null | undefined
): boolean {
  if (!health) return false;
  if (health.status === "error" || health.ok === false) return false;
  return health.writable === true;
}

export function assertLocalDataWritable(): void {
  if (availability === "available") return;
  throw new LocalDataUnavailableError(
    availability,
    availability === "checking"
      ? LOCAL_DATA_CHECKING_MESSAGE
      : LOCAL_DATA_UNAVAILABLE_MESSAGE
  );
}

export async function probeLocalDataHealth(): Promise<LocalDataAvailability> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const health = await probeImpl();
      if (isWritableHealth(health)) {
        setLocalDataAvailability(
          "available",
          typeof health.message === "string" ? health.message : ""
        );
        return "available";
      }
      const message =
        typeof health.message === "string" && health.message.trim()
          ? health.message
          : LOCAL_DATA_UNAVAILABLE_MESSAGE;
      setLocalDataAvailability("unavailable", message);
      return "unavailable";
    } catch (error) {
      setLocalDataAvailability(
        "unavailable",
        error instanceof Error ? error.message : LOCAL_DATA_UNAVAILABLE_MESSAGE
      );
      return "unavailable";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function ensureLocalDataWritable(): Promise<void> {
  if (availability === "available") return;
  const status = await probeLocalDataHealth();
  if (status === "available") return;
  throw new LocalDataUnavailableError(status);
}

export async function prepareLocalDataWrite(): Promise<boolean> {
  try {
    await ensureLocalDataWritable();
    return true;
  } catch (error) {
    if (isLocalDataUnavailableError(error)) return false;
    throw error;
  }
}

export function resetLocalDataAvailabilityForTests(
  status: LocalDataAvailability = "checking",
  probe?: HealthProbe
): void {
  availability = status;
  lastMessage =
    status === "available"
      ? ""
      : status === "checking"
        ? LOCAL_DATA_CHECKING_MESSAGE
        : LOCAL_DATA_UNAVAILABLE_MESSAGE;
  inFlight = null;
  probeImpl = probe ?? defaultHealthProbe;
  listeners.clear();
}

export function setLocalDataHealthProbeForTests(probe: HealthProbe): void {
  probeImpl = probe;
}

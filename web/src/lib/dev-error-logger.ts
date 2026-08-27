import { isLocalDataUnavailableError } from "./local-data-availability.ts";

const EXTENSION_URL_PATTERN =
  /(?:chrome|moz|edge)-extension:\/\/[^\s)\]}]+/gi;
const NON_EXTENSION_URL_PATTERN =
  /(?:https?|file|webpack(?:-internal)?|node):\/\/[^\s)\]}]+/i;
const APP_PATH_PATTERN =
  /(?:^|[\\/])(?:_next|src|api)[\\/]/i;
const STACK_FRAME_PATTERN = /^\s*(?:at\s+|[^@\s]+@)/i;
const SCRIPT_LOCATION_PATTERN =
  /(?:^|[\s(])[^\s()]+\.(?:[cm]?[jt]sx?)(?::\d+){0,2}(?=$|[\s)])/i;

type DevConsoleLogger = (...data: unknown[]) => void;

export interface DevRuntimeErrorEvent {
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  preventDefault: () => void;
}

export interface DevPromiseRejectionEvent {
  reason?: unknown;
  preventDefault: () => void;
}

function stringProperty(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : "";
}

function errorStack(value: unknown): string {
  return value instanceof Error
    ? (value.stack ?? "")
    : stringProperty(value, "stack");
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return stringProperty(value, "message");
}

function sourceEvidence(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return [
    errorStack(value),
    stringProperty(value, "fileName"),
    stringProperty(value, "sourceURL"),
  ];
}

/**
 * Ignore only errors whose identifiable source locations are all browser
 * extension URLs. Any app or unknown script frame keeps the error visible.
 */
export function isExclusivelyBrowserExtensionError(
  evidence: readonly unknown[]
): boolean {
  let foundExtensionSource = false;
  let foundOtherSource = false;

  for (const value of evidence) {
    for (const source of sourceEvidence(value)) {
      for (const line of source.split("\n")) {
        EXTENSION_URL_PATTERN.lastIndex = 0;
        const withoutExtensionUrls = line.replace(
          EXTENSION_URL_PATTERN,
          () => {
            foundExtensionSource = true;
            return "";
          }
        );

        if (
          NON_EXTENSION_URL_PATTERN.test(withoutExtensionUrls) ||
          APP_PATH_PATTERN.test(withoutExtensionUrls) ||
          (STACK_FRAME_PATTERN.test(line) &&
            SCRIPT_LOCATION_PATTERN.test(withoutExtensionUrls))
        ) {
          foundOtherSource = true;
        }
      }
    }
  }

  return foundExtensionSource && !foundOtherSource;
}

export function handleDevRuntimeError(
  event: DevRuntimeErrorEvent,
  log: DevConsoleLogger = console.error
): void {
  if (isLocalDataUnavailableError(event.error ?? event.message)) {
    event.preventDefault();
    return;
  }
  if (isExclusivelyBrowserExtensionError([event.error, event.filename])) {
    event.preventDefault();
    return;
  }

  const message = errorMessage(event.error) || event.message || "Unknown error";
  const stack = errorStack(event.error)
    .split("\n")
    .slice(0, 8)
    .map((line) => line.trim())
    .join(" | ");
  log(
    "[P&P runtime]",
    message,
    stack ? `\nstack: ${stack}` : "",
    event.filename
      ? `\nfile: ${event.filename}:${event.lineno ?? "?"}:${event.colno ?? "?"}`
      : ""
  );
}

export function handleDevUnhandledRejection(
  event: DevPromiseRejectionEvent,
  log: DevConsoleLogger = console.error
): void {
  if (isLocalDataUnavailableError(event.reason)) {
    event.preventDefault();
    return;
  }
  if (isExclusivelyBrowserExtensionError([event.reason])) {
    event.preventDefault();
    return;
  }

  const reason = event.reason;
  const message =
    errorMessage(reason) ||
    (typeof reason === "string" ? reason : "Unhandled promise rejection");
  log("[P&P promise]", message);
}

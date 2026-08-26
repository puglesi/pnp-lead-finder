"use client";

import { useEffect } from "react";
import { isLocalDataUnavailableError } from "@/lib/local-data-client";

/**
 * Development-only: log runtime errors with component stack hints
 * without dumping secrets or store payloads.
 */
export function DevErrorLogger() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const onError = (event: ErrorEvent) => {
      if (isLocalDataUnavailableError(event.error ?? event.message)) {
        event.preventDefault();
        return;
      }
      const message = event.error?.message ?? event.message ?? "Unknown error";
      const stack =
        typeof event.error?.stack === "string"
          ? event.error.stack
              .split("\n")
              .slice(0, 8)
              .map((line: string) => line.trim())
              .join(" | ")
          : "";
      console.error(
        "[P&P runtime]",
        message,
        stack ? `\nstack: ${stack}` : "",
        event.filename
          ? `\nfile: ${event.filename}:${event.lineno ?? "?"}:${event.colno ?? "?"}`
          : ""
      );
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isLocalDataUnavailableError(event.reason)) {
        event.preventDefault();
        return;
      }
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      console.error("[P&P promise]", message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

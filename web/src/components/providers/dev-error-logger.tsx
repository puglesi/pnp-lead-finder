"use client";

import { useEffect } from "react";
import {
  handleDevRuntimeError,
  handleDevUnhandledRejection,
} from "@/lib/dev-error-logger";
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
      handleDevRuntimeError(event);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isLocalDataUnavailableError(event.reason)) {
        event.preventDefault();
        return;
      }
      handleDevUnhandledRejection(event);
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

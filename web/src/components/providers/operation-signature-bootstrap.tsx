"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { ensureOperationSignaturesHydrated } from "@/store/operation-signature-store";

/** Loads the official SQLite signatures (IndexedDB is cache/fallback) before send. */
export function OperationSignatureBootstrap() {
  useEffect(() => {
    void ensureOperationSignaturesHydrated().catch((error) => {
      toast.error(
        error instanceof Error
          ? `Assinaturas oficiais indisponíveis: ${error.message}`
          : "Assinaturas oficiais indisponíveis."
      );
    });
  }, []);

  return null;
}

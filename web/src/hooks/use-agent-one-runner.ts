"use client";

import { useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useAgentOneStore } from "@/store/agent-one-store";
import { useLeadStore } from "@/store/lead-store";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro inesperado na busca";
}

export function useAgentOneRunner() {
  const executionActiveRef = useRef(false);

  const runQueue = useCallback(async () => {
    if (executionActiveRef.current) return;
    executionActiveRef.current = true;

    try {
      while (useAgentOneStore.getState().status === "running") {
        const sector = useAgentOneStore.getState().claimNextSector();

        if (!sector) {
          useAgentOneStore.getState().finish();
          break;
        }

        try {
          await useLeadStore
            .getState()
            .performBulkSearch(sector.sector, sector.location);

          const leadState = useLeadStore.getState();
          const searchProgress = leadState.bulkProgress.sectors.find(
            (item) => item.sector === sector.sector
          );

          if (searchProgress?.status === "error") {
            throw new Error(
              searchProgress.error ?? "Falha ao buscar " + sector.sector
            );
          }

          const foundLeads = leadState.currentLeads;
          let savedLeadCount = 0;
          for (const lead of foundLeads) {
            if (leadState.saveLead(lead)) savedLeadCount++;
          }

          useAgentOneStore
            .getState()
            .completeSector(sector.id, foundLeads.length);
          toast.success(
            sector.sector +
              ": " +
              foundLeads.length +
              " encontrado(s), " +
              savedLeadCount +
              " novo(s) salvo(s)."
          );
        } catch (error) {
          const message = errorMessage(error);
          useAgentOneStore.getState().failSector(sector.id, message);
          toast.error(sector.sector + ": " + message);
        }
      }
    } catch (error) {
      const message = errorMessage(error);
      useAgentOneStore.getState().fail(message);
      toast.error("Agente 1: " + message);
    } finally {
      executionActiveRef.current = false;
    }
  }, []);

  return {
    runQueue,
    isExecutionActive: () => executionActiveRef.current,
  };
}

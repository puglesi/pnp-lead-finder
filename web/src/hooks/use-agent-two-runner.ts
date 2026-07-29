"use client";

import { useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { createAgentTwoExecutionGuard } from "@/lib/agent-two-execution";
import { localEmailValidationProvider } from "@/lib/client-email-validation";
import {
  emailResultToLeadUpdate,
  queueItemToLeadUpdate,
} from "@/lib/agent-two-queue";
import { useAgentTwoStore } from "@/store/agent-two-store";
import { useLeadStore } from "@/store/lead-store";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Erro inesperado durante a validação";
}

export function persistImmediateAgentTwoResults() {
  const { queue } = useAgentTwoStore.getState();
  const leadStore = useLeadStore.getState();
  for (const item of queue) {
    const update = queueItemToLeadUpdate(item);
    if (update) leadStore.updateLeadEmailValidation(item.leadId, update);
  }
}

export function useAgentTwoRunner() {
  const executionGuardRef = useRef(createAgentTwoExecutionGuard());

  const runQueue = useCallback(async () => {
    if (!executionGuardRef.current.begin()) return;

    try {
      while (useAgentTwoStore.getState().status === "running") {
        const item = useAgentTwoStore.getState().claimNextItem();
        if (!item) {
          useAgentTwoStore.getState().finish();
          break;
        }

        try {
          const result = await localEmailValidationProvider.validate(
            item.email
          );
          const updated = useLeadStore
            .getState()
            .updateLeadEmailValidation(
              item.leadId,
              emailResultToLeadUpdate(result)
            );
          if (!updated) {
            throw new Error("Lead não encontrado em Meus Leads");
          }
          useAgentTwoStore.getState().completeItem(item.id, result);
        } catch (error) {
          const message = errorMessage(error);
          const completedAt = new Date().toISOString();
          useLeadStore.getState().updateLeadEmailValidation(item.leadId, {
            emailValidationStatus: "unknown",
            emailValidationReason: "validation_error",
            normalizedEmail: item.normalizedEmail ?? undefined,
            emailValidatedAt: completedAt,
            emailValidationProvider: "local_dns",
            isRoleBasedEmail: false,
          });
          useAgentTwoStore.getState().failItem(item.id, message);
          toast.error(item.company + ": " + message);
        }
      }
    } catch (error) {
      const message = errorMessage(error);
      useAgentTwoStore.getState().fail(message);
      toast.error("Agente 2: " + message);
    } finally {
      executionGuardRef.current.end();
    }
  }, []);

  return {
    runQueue,
    isExecutionActive: () => executionGuardRef.current.isActive(),
  };
}

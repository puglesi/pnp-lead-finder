"use client";

import { useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  createLocalEmailValidationProvider,
  type EmailDomainChecker,
} from "@/lib/email-validation";
import {
  emailResultToLeadUpdate,
  queueItemToLeadUpdate,
} from "@/lib/agent-two-queue";
import { useAgentTwoStore } from "@/store/agent-two-store";
import { useLeadStore } from "@/store/lead-store";
import type { EmailDomainCheckResult } from "@/types/email-validation";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Erro inesperado durante a validação";
}

function isDomainCheckResult(value: unknown): value is EmailDomainCheckResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "domain" in value &&
    typeof value.domain === "string" &&
    "exists" in value &&
    typeof value.exists === "boolean" &&
    "hasMxRecords" in value &&
    typeof value.hasMxRecords === "boolean" &&
    "reason" in value &&
    (value.reason === null ||
      value.reason === "domain_not_found" ||
      value.reason === "no_mx_records" ||
      value.reason === "dns_error")
  );
}

const checkDomainFromApi: EmailDomainChecker = async (domain) => {
  const response = await fetch("/api/email-validation/domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });
  if (!response.ok) throw new Error("Falha ao verificar o domínio do e-mail");
  const result: unknown = await response.json();
  if (!isDomainCheckResult(result)) {
    throw new Error("Resposta inválida da verificação de domínio");
  }
  return result;
};

const localProvider = createLocalEmailValidationProvider(checkDomainFromApi);

export function persistImmediateAgentTwoResults() {
  const { queue } = useAgentTwoStore.getState();
  const leadStore = useLeadStore.getState();
  for (const item of queue) {
    const update = queueItemToLeadUpdate(item);
    if (update) leadStore.updateLeadEmailValidation(item.leadId, update);
  }
}

export function useAgentTwoRunner() {
  const executionActiveRef = useRef(false);

  const runQueue = useCallback(async () => {
    if (executionActiveRef.current) return;
    executionActiveRef.current = true;

    try {
      while (useAgentTwoStore.getState().status === "running") {
        const item = useAgentTwoStore.getState().claimNextItem();
        if (!item) {
          useAgentTwoStore.getState().finish();
          break;
        }

        try {
          const result = await localProvider.validate(item.email);
          const updated = useLeadStore
            .getState()
            .updateLeadEmailValidation(
              item.leadId,
              emailResultToLeadUpdate(result)
            );
          if (!updated) throw new Error("Lead não encontrado em Meus Leads");
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
      executionActiveRef.current = false;
    }
  }, []);

  return {
    runQueue,
    isExecutionActive: () => executionActiveRef.current,
  };
}

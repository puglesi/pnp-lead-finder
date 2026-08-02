export type PipelineStage =
  | "search"
  | "garimpo"
  | "validation"
  | "campaign"
  | "send"
  | "complete";

export const PIPELINE_STAGES: readonly {
  id: PipelineStage;
  label: string;
}[] = [
  { id: "search", label: "Busca" },
  { id: "garimpo", label: "Garimpo" },
  { id: "validation", label: "Validação" },
  { id: "campaign", label: "Campanha" },
  { id: "send", label: "Envio" },
  { id: "complete", label: "Envio concluído" },
] as const;

export interface LeadBatch {
  batchId: string;
  sector: string;
  location: string;
  createdAt: string;
  foundCount: number;
  stage: PipelineStage;
  searchRecordId?: string;
  campaignId?: string;
  label: string;
  /**
   * Exact member lead IDs from the SearchRecord snapshot.
   * Exclusive membership — never expand by sector/location/fingerprint.
   */
  leadIds?: string[];
}

export interface BatchLeadStats {
  total: number;
  withWebsite: number;
  withEmail: number;
  withoutEmail: number;
  /** Strict status === "valid" (rare with local DNS-only validation). */
  approved: number;
  /**
   * Campaign-eligible: has email, not definitively invalid.
   * Includes mailbox_not_verified / unknown after MX (not confirmed mailbox).
   */
  eligible: number;
  /** mailbox unknown / risky / catch_all (subset of eligible when MX-ok). */
  unknown: number;
  /** Real invalid emails only — never "sem e-mail". */
  invalid: number;
  pendingValidation: number;
}

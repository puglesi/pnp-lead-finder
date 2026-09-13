import { randomUUID } from "node:crypto";
import { LocalDatabaseAdapter } from "./local-database.ts";
import { normalizeAgentThreeSnapshot, claimNextAgentThreeItem, pauseAgentThree, markAgentThreeItemUnknown, releaseAgentThreeSendingItem, resumeAgentThree, startAgentThree } from "../agent-three-queue.ts";
import { reconcileAgentThreeOperation, reconcileCampaignFromSendHistory } from "../agent-three-reconciliation.ts";
import { applyAgentThreeSmtpResult } from "../agent-three-delivery.ts";
import { buildAgentThreeSendRequest } from "../agent-three-send-request.ts";
import { claimNextAgentOneSector, completeAgentOneSector, normalizeAgentOneSnapshot, finishAgentOne, resumeAgentOne } from "../agent-one-queue.ts";
import { claimNextAgentTwoItem, completeAgentTwoItem, normalizeAgentTwoSnapshot, finishAgentTwo, queueItemToLeadUpdate, resumeAgentTwo } from "../agent-two-queue.ts";
import { saveAgentOneLeads } from "../agent-one-leads.ts";
import { selectAgentThreeIntervalSeconds } from "../agent-three-execution.ts";
import type { AgentThreeSendRequest, AgentThreeSmtpResult } from "../agent-three-smtp-contract.ts";
import type { EmailValidationResult } from "../../types/email-validation.ts";
import type { Lead } from "../../types/lead.ts";
import type { Campaign } from "../../types/campaign.ts";
import type { CampaignProfileId } from "../../types/campaign-profile.ts";
import type { CommercialStoreKey } from "../../types/local-data.ts";

type State = Record<string, unknown>;
export interface WorkerDependencies {
  search(sector: string, location: string, limit: number): Promise<{ leads: Lead[]; source: string }>;
  validate(email: string | null): Promise<EmailValidationResult>;
  send(request: AgentThreeSendRequest): Promise<AgentThreeSmtpResult>;
}
export class OperationalWorker {
  readonly ownerId = "worker-" + randomUUID();
  private operations = new Set<string>();
  private stopping = false;
  private active: Promise<void> | null = null;
  private nextSend = new Map<string, number>();
  constructor(readonly database: LocalDatabaseAdapter, private dependencies: WorkerDependencies,
    readonly monitor = true) {}

  start(): boolean {
    if (this.database.claimRunnerLease("worker", this.ownerId, 45_000).decision !== "claimed") return false;
    this.database.workerHeartbeat(this.ownerId, this.monitor ? "monitor" : "online");
    return true;
  }
  heartbeat(): boolean {
    if (!this.database.heartbeatRunnerLease("worker", this.ownerId, 45_000).ok) { this.stopping = true; return false; }
    for (const operation of this.operations) {
      if (!this.database.heartbeatRunnerLease(operation, this.ownerId).ok) {
        this.operations.delete(operation); this.stopping = true; return false;
      }
    }
    this.database.workerHeartbeat(this.ownerId, this.monitor ? "monitor" : "online");
    return true;
  }
  requestShutdown(): void { this.stopping = true; }
  tick(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.step().finally(() => { this.active = null; });
    return this.active;
  }
  private async step() {
    if (this.stopping || !this.heartbeat() || this.monitor) return;
    for (const operation of ["agent-1", "agent-2", "panek-puglesi", "modeclean"]) {
      if (this.stopping) break;
      const key: CommercialStoreKey = operation === "agent-1" ? "pnp-agent-one" : operation === "agent-2" ? "pnp-agent-two" : "pnp-agent-three";
      const state = this.database.readCommercialStore(key);
      const control = this.database.workerControl(operation);
      if (control === "paused") {
        if (this.operations.has(operation)) { this.pause(key, operation); this.release(operation); }
        continue;
      }
      const running = operation.startsWith("agent-") ? state.status === "running"
        : normalizeAgentThreeSnapshot(state, true).operations[operation as CampaignProfileId].status === "running";
      if (!running && control !== "running") { this.release(operation); continue; }
      if (this.database.claimRunnerLease(operation, this.ownerId).decision !== "claimed") continue;
      this.operations.add(operation);
      try {
        if (!running) {
          this.write(key, operation, current => {
            if (operation === "agent-1") return resumeAgentOne({ ...normalizeAgentOneSnapshot(current), status: "paused" }, false) as unknown as State;
            if (operation === "agent-2") return resumeAgentTwo({ ...normalizeAgentTwoSnapshot(current), status: "paused" }, false) as unknown as State;
            const profile = operation as CampaignProfileId;
            const snapshot = normalizeAgentThreeSnapshot(current, true);
            if (snapshot.operations[profile].queue.some(item => ["unknown", "sending"].includes(item.queueStatus))) return current;
            const started = snapshot.operations[profile].status === "paused"
              ? resumeAgentThree(snapshot, profile, true, new Date().toISOString())
              : startAgentThree(snapshot, profile, true, new Date().toISOString());
            return started.snapshot as unknown as State;
          });
          // Start is a one-shot command. A safety pause must not be auto-resumed.
        }
        if (control === "running") this.database.clearWorkerControl(operation);
        if (operation === "agent-1") await this.agentOne();
        else if (operation === "agent-2") await this.agentTwo();
        else await this.agentThree(operation as CampaignProfileId);
      } catch {
        // Error content may contain provider credentials: persist only a fixed code.
        this.database.workerHeartbeat(this.ownerId, "online", "WORK_ITEM_FAILED");
        this.pause(key, operation);
      }
    }
  }
  private write(key: CommercialStoreKey, operation: string, update: (state: State) => State) {
    if (!this.database.updateRunnerStore(key, operation, this.ownerId, update)) throw new Error("LEASE_LOST");
  }
  private pause(key: CommercialStoreKey, operation: string) {
    this.write(key, operation, state => {
      if (key === "pnp-agent-three") return pauseAgentThree(normalizeAgentThreeSnapshot(state, true), operation as CampaignProfileId, new Date().toISOString()) as unknown as State;
      return { ...state, status: "paused" };
    });
  }
  private release(operation: string) {
    if (this.operations.delete(operation)) this.database.releaseRunnerLease(operation, this.ownerId);
  }
  private releaseBeforeSmtp(profile: CampaignProfileId, itemId: string) {
    this.write("pnp-agent-three", profile, state => releaseAgentThreeSendingItem(normalizeAgentThreeSnapshot(state, true), profile,
      itemId, new Date().toISOString(), { pause: true, consumeAttempt: false, message: "Envio bloqueado antes do SMTP." }) as unknown as State);
  }
  private async agentOne() {
    const key = "pnp-agent-one";
    let claim = claimNextAgentOneSector(normalizeAgentOneSnapshot(this.database.readCommercialStore(key), true), new Date().toISOString());
    // Interrupted searches are safe to repeat; validation/sending are handled separately.
    if (!claim.sector && claim.snapshot.queue.some(item => item.status === "running")) {
      claim = claimNextAgentOneSector({ ...claim.snapshot, currentSectorId: null,
        queue: claim.snapshot.queue.map(item => item.status === "running" ? { ...item, status: "pending" } : item) }, new Date().toISOString());
    }
    if (!claim.sector) { this.write(key, "agent-1", () => finishAgentOne(claim.snapshot) as unknown as State); return; }
    this.write(key, "agent-1", () => claim.snapshot as unknown as State);
    const result = await this.dependencies.search(claim.sector.sector, claim.sector.location, claim.sector.targetLeadCount);
    if (!this.heartbeat()) return;
    const leads = this.database.readCommercialStore("pnp-lead-finder");
    const saved = [...(leads.savedLeads as Lead[] ?? [])];
    const outcome = saveAgentOneLeads({ results: result.leads, existingSavedLeads: saved, source: result.source,
      targetLeadCount: claim.sector.targetLeadCount, saveLead: lead => { saved.push(lead); return true; } });
    this.database.saveCommercialStore("pnp-lead-finder", { savedLeads: saved });
    this.write(key, "agent-1", state => completeAgentOneSector(normalizeAgentOneSnapshot(state, true), claim.sector!.id, outcome.savedLeadCount, new Date().toISOString()) as unknown as State);
  }
  private async agentTwo() {
    const key = "pnp-agent-two";
    const state = normalizeAgentTwoSnapshot(this.database.readCommercialStore(key), true);
    // No SMTP verification: this agent only performs DNS validation.
    const recovered = { ...state, currentItemId: null,
      queue: state.queue.map(item => item.status === "validating" ? { ...item, status: "pending" as const } : item) };
    const claim = claimNextAgentTwoItem(recovered, new Date().toISOString());
    if (!claim.item) { this.write(key, "agent-2", () => finishAgentTwo(recovered) as unknown as State); return; }
    this.write(key, "agent-2", () => claim.snapshot as unknown as State);
    const result = await this.dependencies.validate(claim.item.email);
    if (!this.heartbeat()) return;
    const leadState = this.database.readCommercialStore("pnp-lead-finder");
    const completed = completeAgentTwoItem(claim.snapshot, claim.item.id, result);
    const update = queueItemToLeadUpdate(completed.queue.find(item => item.id === claim.item!.id)!);
    this.database.saveCommercialStore("pnp-lead-finder", { savedLeads: (leadState.savedLeads as Lead[] ?? []).map(lead => lead.id === claim.item!.leadId ? { ...lead, ...update } : lead) });
    this.write(key, "agent-2", current => completeAgentTwoItem(normalizeAgentTwoSnapshot(current, true), claim.item!.id, result) as unknown as State);
  }
  private async agentThree(profile: CampaignProfileId) {
    const key = "pnp-agent-three";
    const now = new Date().toISOString();
    const records = this.database.listSendHistory({ operation: profile });
    let reconciled = reconcileAgentThreeOperation(normalizeAgentThreeSnapshot(this.database.readCommercialStore(key), true), profile, records, now).snapshot;
    for (const item of reconciled.operations[profile].queue) {
      if (item.queueStatus === "sending") reconciled = markAgentThreeItemUnknown(reconciled, profile, item.id, now);
    }
    this.write(key, profile, current => ({ ...current, operations: { ...(current.operations as State), [profile]: reconciled.operations[profile] } }));
    if (reconciled.operations[profile].queue.some(item => item.queueStatus === "unknown")) { this.pause(key, profile); return; }
    const cooldowns = this.database.operationCooldowns(profile);
    if (cooldowns.some(row => row.paused)) { this.pause(key, profile); return; }
    if (cooldowns.some(row => row.until_at && String(row.until_at) > now)) return;
    const latestConfirmed = Math.max(0, ...records.filter(row => row.status === "confirmed").map(row => Date.parse(row.confirmedAt ?? "") || 0));
    const minInterval = reconciled.operations[profile].minIntervalSeconds;
    if (latestConfirmed && Date.now() < latestConfirmed + minInterval * 1_000) return;
    if (Date.now() < (this.nextSend.get(profile) ?? 0)) return;
    const claim = claimNextAgentThreeItem(reconciled, profile, now);
    if (!claim.item) { this.pause(key, profile); return; }
    this.write(key, profile, current => ({ ...current, operations: { ...(current.operations as State), [profile]: claim.snapshot.operations[profile] } }));
    const hydration = this.database.hydration();
    const campaigns = (hydration.stores["pnp-campaigns"] as { campaigns?: Campaign[] })?.campaigns ?? [];
    const campaign = campaigns.find(item => item.id === claim.item!.campaignId);
    if (!campaign) { this.releaseBeforeSmtp(profile, claim.item.id); return; }
    const lead = (this.database.readCommercialStore("pnp-lead-finder").savedLeads as Lead[] ?? []).find(item => item.id === claim.item!.leadId) ?? null;
    const signature = this.database.getSignature(profile);
    if (!signature?.enabled || !signature.html.trim()) { this.releaseBeforeSmtp(profile, claim.item.id); return; }
    const built = buildAgentThreeSendRequest(profile, campaign, claim.item, lead, { ownerId: this.ownerId,
      officialSignature: { enabled: signature.enabled, body: signature.html, operation: profile } });
    if (!built.request || this.stopping) { this.releaseBeforeSmtp(profile, claim.item.id); return; }
    if (!this.heartbeat()) return;
    const response = await this.dependencies.send(built.request);
    if (!this.heartbeat()) return;
    const transient = ["auth_transient", "provider_rate_limit", "transient_error"].includes(response.status);
    this.write(key, profile, current => {
      const snapshot = normalizeAgentThreeSnapshot(current, true);
      return (transient ? releaseAgentThreeSendingItem(snapshot, profile, claim.item!.id, new Date().toISOString(),
        { pause: false, consumeAttempt: true, consumeCapacity: false, message: response.message })
        : applyAgentThreeSmtpResult(snapshot, profile, claim.item!.id, response, new Date().toISOString()).snapshot) as unknown as State;
    });
    if (response.status === "sent" && response.messageId) {
      this.database.saveCommercialStore("pnp-campaigns", { campaigns: [reconcileCampaignFromSendHistory(campaign,
        this.database.listSendHistory({ operation: profile }))] });
    }
    const settings = claim.snapshot.operations[profile];
    this.nextSend.set(profile, Date.now() + Math.max(1, selectAgentThreeIntervalSeconds(settings.minIntervalSeconds, settings.maxIntervalSeconds, Math.random)) * 1_000);
  }
  async shutdown() {
    this.stopping = true;
    if (this.active) await this.active;
    for (const operation of this.operations) {
      // Preserve running intent for reboot; unfinished send is reconciled on restart.
      this.database.releaseRunnerLease(operation, this.ownerId);
    }
    this.operations.clear();
    this.database.workerHeartbeat(this.ownerId, "offline");
    this.database.releaseRunnerLease("worker", this.ownerId);
  }
}

import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

import { executeSearch } from "../src/lib/search/engine.ts";
import { enrichWebsiteLeadBatch } from "../src/lib/search/scrapers/website-enricher.ts";
import {
  normalizeEmail,
  validateEmailLocally,
} from "../src/lib/email-validation.ts";
import { checkEmailDomain } from "../src/lib/email-domain-check.ts";
import { validateAgentThreeCampaignLeads } from "../src/lib/agent-three-auto-validation.ts";
import {
  countLeadsWithEmail,
  selectOneClickEligibleLeads,
} from "../src/lib/one-click-outreach.ts";
import { createInitialEmailTemplates } from "../src/lib/email-template-library.ts";
import {
  auditGlobalEmailRecipients,
} from "../src/lib/global-email-deduplication.ts";
import {
  configureAgentThreeIntervals,
  configureAgentThreeLimit,
  createInitialAgentThreeSnapshot,
  claimNextAgentThreeItem,
  finishAgentThree,
  loadAgentThreeLeads,
  prepareAgentThreeCampaign,
  startAgentThree,
} from "../src/lib/agent-three-queue.ts";
import { applyAgentThreeSmtpResult } from "../src/lib/agent-three-delivery.ts";
import { buildAgentThreeSendRequest } from "../src/lib/agent-three-send-request.ts";
import { isRealDeliveryMessageId } from "../src/lib/campaign-delivery-metrics.ts";
import {
  sendAgentThreeSmtp,
  verifyAgentThreeSmtpConnection,
} from "../src/lib/server/agent-three-smtp-core.ts";
import {
  DEFAULT_BATCH_SEND_CONFIG,
  DEFAULT_FOLLOW_UP,
  DEFAULT_SIGNATURE,
  DEFAULT_UNSUBSCRIBE_LINK,
} from "../src/types/campaign.ts";

const OPERATION = "panek-puglesi";
const SECTOR = "Property Finance Broker";
const LOCATION = "London";
const MAX_REAL_EMAILS = 3;
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 10;
const DATA_DIR = path.resolve(".data");
const LEDGER_PATH = path.join(DATA_DIR, "agent-three-live-ledger.json");
const LOCK_PATH = path.join(DATA_DIR, "agent-three-live-test.lock");
const TEMPLATE_ID = "panek-puglesi-partnership";

function emptyLedger() {
  return { version: 1, deliveries: [], permanentBlocks: [], attempts: [], runs: [] };
}

function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return emptyLedger();
  const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  return {
    ...emptyLedger(),
    ...parsed,
    deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
    permanentBlocks: Array.isArray(parsed.permanentBlocks) ? parsed.permanentBlocks : [],
    attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
  };
}

function writeLedger(ledger) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryPath = `${LEDGER_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
  fs.renameSync(temporaryPath, LEDGER_PATH);
}

function acquireExclusiveRunLock() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    return fs.openSync(LOCK_PATH, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("Já existe um teste real do Agente 3 em execução.");
    }
    throw error;
  }
}

function releaseExclusiveRunLock(handle) {
  if (handle === null) return;
  try { fs.closeSync(handle); } catch {}
  try { fs.unlinkSync(LOCK_PATH); } catch {}
}

function maskMessageId(messageId) {
  const value = String(messageId ?? "").trim();
  if (!value) return null;
  if (value.length <= 10) return `${value.slice(0, 3)}***`;
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomIntervalMs() {
  const span = MAX_INTERVAL_SECONDS - MIN_INTERVAL_SECONDS + 1;
  return (MIN_INTERVAL_SECONDS + Math.floor(Math.random() * span)) * 1000;
}

function mergeEnrichment(leads, updates) {
  const byId = new Map(updates.map((item) => [item.id, item]));
  return leads.map((lead) => {
    const update = byId.get(lead.id);
    if (!update) return lead;
    return {
      ...lead,
      email: lead.email || update.email || null,
      phone: lead.phone && lead.phone !== "—" ? lead.phone : update.phone || lead.phone,
    };
  });
}

function suppressionBlocks(environment) {
  const raw = String(environment.AGENT3_SUPPRESSION_LIST ?? "");
  return raw
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean)
    .map((normalizedEmail) => ({
      operation: OPERATION,
      normalizedEmail,
      reason: "contact_blocked",
      occurredAt: new Date().toISOString(),
    }));
}

function buildHistory(ledger) {
  return ledger.deliveries
    .filter(
      (item) =>
        item.operation &&
        normalizeEmail(item.normalizedEmail) &&
        isRealDeliveryMessageId(item.providerMessageId)
    )
    .map((item) => ({
      operation: item.operation,
      normalizedEmail: normalizeEmail(item.normalizedEmail),
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      sentAt: item.sentAt,
      providerMessageId: item.providerMessageId,
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

function buildBlocks(ledger) {
  return [
    ...ledger.permanentBlocks,
    ...suppressionBlocks(process.env),
    ...ledger.attempts
      .filter((item) => item.status === "pending")
      .map((item) => ({
        operation: item.operation,
        normalizedEmail: item.normalizedEmail,
        reason: "contact_blocked",
        occurredAt: item.startedAt,
      })),
  ];
}

function createReportBase(runId, batchId, campaign, template, foundCount) {
  return {
    runId,
    batchId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    operation: OPERATION,
    sector: SECTOR,
    location: LOCATION,
    template: `${template.name} — Padrão`,
    templateId: template.id,
    subject: template.subject,
    companiesFound: foundCount,
    contactsWithEmail: 0,
    duplicates: 0,
    alreadyContacted: 0,
    blocked: 0,
    eligible: 0,
    attempted: 0,
    sent: 0,
    failures: [],
    providerMessageIds: [],
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function persistRun(ledger, report) {
  ledger.runs = [report, ...ledger.runs.filter((item) => item.runId !== report.runId)];
  writeLedger(ledger);
}

async function main() {
  let lockHandle = null;
  let ledger = readLedger();
  let report = null;
  try {
    lockHandle = acquireExclusiveRunLock();
    const runId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const search = await executeSearch({
      keyword: SECTOR,
      location: LOCATION,
      maxResults: MAX_REAL_EMAILS,
      strictMaxResults: true,
      delayMs: 0,
      provider: "serpapi",
      allowArtificialResults: false,
      serpapiDeepPagination: false,
      useMaxLeads: false,
    });
    const forbiddenSource = /autonomous|fallback|supplemented|no-results/i.test(search.source);
    if (
      search.provider !== "serpapi" ||
      search.activeProvider !== "serpapi" ||
      !search.isLive ||
      !search.apiCallConsumed ||
      forbiddenSource ||
      search.leads.length === 0
    ) {
      throw new Error(`SerpAPI real indisponível (fonte: ${search.source}).`);
    }

    let leads = search.leads.slice(0, MAX_REAL_EMAILS);
    const now = new Date().toISOString();
    const batchId = `batch-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    leads = leads.map((lead) => ({ ...lead, batchId }));

    const enrichable = leads
      .filter((lead) => lead.website && !/google\.com\/maps/i.test(lead.website))
      .map(({ id, website }) => ({ id, website }));
    const enrichment = await enrichWebsiteLeadBatch(enrichable, { concurrency: 3 });
    leads = mergeEnrichment(leads, enrichment);

    const validation = await validateAgentThreeCampaignLeads(
      leads,
      async (email) => validateEmailLocally(email, checkEmailDomain)
    );
    leads = validation.leads;

    const template = createInitialEmailTemplates(now).find(
      (item) => item.id === TEMPLATE_ID && item.operation === OPERATION && item.isDefault
    );
    if (!template || template.name !== "Parceria B2B" || template.contactKind !== "first_contact") {
      throw new Error("Template padrão Parceria B2B não encontrado.");
    }

    const campaignId = `camp-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const campaign = {
      id: campaignId,
      campaignProfileId: OPERATION,
      emailTemplateId: template.id,
      contactKind: template.contactKind,
      name: `${SECTOR} · ${LOCATION} · teste final`,
      subject: template.subject,
      body: template.body,
      fromName: "Panek & Pugliesi",
      fromEmail: template.sender,
      replyTo: template.replyTo,
      unsubscribeLink: DEFAULT_UNSUBSCRIBE_LINK,
      followUp: { ...DEFAULT_FOLLOW_UP },
      leadIds: [],
      leadStatuses: [],
      leadSource: "recent",
      batchId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      sentCount: 0,
      openedCount: 0,
      clickedCount: 0,
      repliedCount: 0,
      failedCount: 0,
      attachment: null,
      signature: { ...DEFAULT_SIGNATURE },
      batchSend: { ...DEFAULT_BATCH_SEND_CONFIG },
      sendErrors: [],
      emailProvider: "gmail-smtp",
    };
    report = createReportBase(runId, batchId, campaign, template, leads.length);

    const candidates = selectOneClickEligibleLeads(leads);
    const preview = auditGlobalEmailRecipients({
      operation: OPERATION,
      campaignId,
      contactKind: "first_contact",
      companiesFound: leads.length,
      recipients: candidates.map((lead) => ({
        leadId: lead.id,
        company: lead.company,
        email: lead.email,
      })),
      history: buildHistory(ledger),
      permanentBlocks: buildBlocks(ledger),
    });
    const includedIds = new Set(
      preview.decisions.filter((item) => item.included).map((item) => item.leadId)
    );
    const sendLeads = candidates.filter((lead) => includedIds.has(lead.id)).slice(0, MAX_REAL_EMAILS);
    campaign.leadIds = sendLeads.map((lead) => lead.id);
    campaign.leadStatuses = sendLeads.map((lead) => ({ leadId: lead.id, status: "pending" }));

    const emailsInBatch = leads.map((lead) => normalizeEmail(lead.email)).filter(Boolean);
    report.contactsWithEmail = countLeadsWithEmail(leads);
    report.duplicates = emailsInBatch.length - new Set(emailsInBatch).size;
    report.alreadyContacted = preview.alreadyContactedSameOperation;
    report.blocked = preview.blockedContacts;
    report.eligible = sendLeads.length;
    persistRun(ledger, report);

    if (sendLeads.length === 0) {
      throw new Error("Nenhum contato elegível para o teste real.");
    }

    const createTransport = (options) => nodemailer.createTransport(options);
    const preflight = await verifyAgentThreeSmtpConnection(OPERATION, {
      environment: process.env,
      createTransport,
    });
    if (preflight.status !== "connected") {
      throw new Error(`SMTP preflight falhou (${preflight.status}).`);
    }

    let snapshot = createInitialAgentThreeSnapshot();
    snapshot = configureAgentThreeIntervals(
      snapshot,
      OPERATION,
      MIN_INTERVAL_SECONDS,
      MAX_INTERVAL_SECONDS,
      new Date().toISOString()
    );
    snapshot = configureAgentThreeLimit(
      snapshot,
      OPERATION,
      MAX_REAL_EMAILS,
      false,
      new Date().toISOString()
    );
    snapshot = loadAgentThreeLeads(
      snapshot,
      OPERATION,
      campaignId,
      sendLeads,
      MAX_REAL_EMAILS,
      new Date().toISOString()
    ).snapshot;
    snapshot = prepareAgentThreeCampaign(
      snapshot,
      OPERATION,
      campaignId,
      sendLeads,
      new Date().toISOString()
    ).snapshot;
    const started = startAgentThree(
      snapshot,
      OPERATION,
      true,
      new Date().toISOString()
    );
    if (!started.started) throw new Error(started.message || "Agente 3 não iniciou.");
    snapshot = started.snapshot;

    while (report.attempted < MAX_REAL_EMAILS) {
      const claimed = claimNextAgentThreeItem(snapshot, OPERATION, new Date().toISOString());
      snapshot = claimed.snapshot;
      if (!claimed.item) break;
      const item = claimed.item;
      const lead = sendLeads.find((candidate) => candidate.id === item.leadId) ?? null;

      ledger = readLedger();
      const immediate = auditGlobalEmailRecipients({
        operation: OPERATION,
        campaignId,
        contactKind: "first_contact",
        companiesFound: 1,
        recipients: [{ leadId: item.leadId, company: item.companyName, email: item.normalizedEmail }],
        history: buildHistory(ledger),
        permanentBlocks: buildBlocks(ledger),
      });
      if (!immediate.decisions[0]?.included) {
        throw new Error("Destinatário bloqueado pela deduplicação global imediata.");
      }

      const requestBuild = buildAgentThreeSendRequest(
        OPERATION,
        campaign,
        item,
        lead,
        { injectTracking: (html) => html }
      );
      if (!requestBuild.request) {
        throw new Error(requestBuild.errorMessage || "Falha ao montar envio do Agente 3.");
      }

      const attempt = {
        id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId,
        operation: OPERATION,
        campaignId,
        leadId: item.leadId,
        normalizedEmail: item.normalizedEmail,
        startedAt: new Date().toISOString(),
        status: "pending",
        providerMessageId: null,
      };
      ledger.attempts.push(attempt);
      report.attempted += 1;
      persistRun(ledger, report);

      const smtpResult = await sendAgentThreeSmtp(requestBuild.request, {
        environment: process.env,
        createTransport,
      });
      const occurredAt = new Date().toISOString();
      const applied = applyAgentThreeSmtpResult(
        snapshot,
        OPERATION,
        item.id,
        smtpResult,
        occurredAt
      );
      snapshot = applied.snapshot;
      const confirmed =
        smtpResult.status === "sent" && isRealDeliveryMessageId(smtpResult.messageId);
      attempt.status = confirmed ? "confirmed" : smtpResult.status;
      attempt.providerMessageId = confirmed ? smtpResult.messageId : null;
      attempt.completedAt = occurredAt;

      if (!confirmed) {
        report.failures.push({ company: item.companyName, reason: smtpResult.status });
        persistRun(ledger, report);
        throw new Error(`Envio do Agente 3 não confirmado (${smtpResult.status}).`);
      }

      ledger.deliveries.push({
        operation: OPERATION,
        normalizedEmail: item.normalizedEmail,
        campaignId,
        campaignName: campaign.name,
        leadId: item.leadId,
        sentAt: occurredAt,
        providerMessageId: smtpResult.messageId,
      });
      report.sent += 1;
      report.providerMessageIds.push(maskMessageId(smtpResult.messageId));
      persistRun(ledger, report);

      const hasMore = snapshot.operations[OPERATION].queue.some(
        (candidate) => candidate.campaignId === campaignId && candidate.queueStatus === "ready"
      );
      if (hasMore && report.attempted < MAX_REAL_EMAILS) await sleep(randomIntervalMs());
    }

    snapshot = finishAgentThree(snapshot, OPERATION, new Date().toISOString());
    report.completedAt = new Date().toISOString();
    report.status =
      report.sent > 0 && report.sent === report.attempted && report.failures.length === 0
        ? "passed"
        : "failed";
    persistRun(ledger, report);
    console.log(JSON.stringify({ report }, null, 2));
    if (report.status !== "passed") process.exitCode = 5;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (report) {
      report.status = "failed";
      report.completedAt = new Date().toISOString();
      if (!report.failures.some((item) => item.reason === message)) {
        report.failures.push({ company: "pipeline", reason: message });
      }
      persistRun(ledger, report);
      console.log(JSON.stringify({ report }, null, 2));
    } else {
      console.log(JSON.stringify({ report: null, status: "failed", cause: message }, null, 2));
    }
    process.exitCode = 4;
  } finally {
    releaseExclusiveRunLock(lockHandle);
  }
}

await main();

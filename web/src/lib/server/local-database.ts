import { backup, DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AgentThreeSendRequest, AgentThreeSmtpResult } from "../agent-three-smtp-contract.ts";
import {
  COMMERCIAL_STORE_KEYS,
  LOCAL_DATA_MIGRATION_VERSION,
  type CommercialStoreKey,
  type LegacySearchBatchSnapshot,
  type LocalDataBridgeSnapshot,
  type LocalDataHealth,
  type LocalDataHydration,
} from "../../types/local-data.ts";
import type { Campaign } from "../../types/campaign.ts";
import type { Lead, SearchRecord } from "../../types/lead.ts";
import type { OfficialSignatureRecord } from "../operation-signature-repository.ts";
import type { EmailTemplate } from "../email-template-library.ts";
import type { EmailBlocklistEntry } from "../email-blocklist.ts";
import type { PersistedSearchBatch } from "../../types/search.ts";
import type { CampaignTrackingEvent } from "../../types/campaign-tracking.ts";

const DATABASE_NAME = "pnp-lead-finder.sqlite";
const SECRET_KEY = /(password|secret|token|credentials|api.?key|smtpPassword|smtpEmail|accessKey)/i;
const EMPTY_COUNTS = {
  leads: 0,
  campaigns: 0,
  searchHistory: 0,
  confirmedSends: 0,
  blocklist: 0,
  templates: 0,
};

type JsonRecord = Record<string, unknown>;
export interface LocalDatabaseOptions {
  databasePath?: string;
  backupDirectory?: string;
  allowVercel?: boolean;
  now?: () => Date;
}

export interface SendIntent {
  id: string;
  intentKey: string;
  existingMessageId?: string;
}

export interface LocalSendHistoryRecord {
  id: string;
  intentKey: string;
  campaignId: string | null;
  leadId: string | null;
  email: string;
  operation: string;
  queueItemId: string | null;
  providerMessageId: string | null;
  confirmedAt: string | null;
  attemptedAt: string | null;
  status: string;
  error: string | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function resolveLocalDataPaths(options: LocalDatabaseOptions = {}) {
  const runtimeCwd =
    process.env.INIT_CWD ??
    Reflect.apply(process.cwd, process, []) as string;
  const cwdOffset =
    basename(runtimeCwd).toLowerCase() === "web" ? ".." : ".";
  const databasePath = resolve(
    options.databasePath ??
      process.env.PNP_LOCAL_DATABASE_PATH ??
      join(
        runtimeCwd,
        cwdOffset,
        "data",
        DATABASE_NAME
      )
  );
  const backupDirectory = resolve(
    options.backupDirectory ??
      process.env.PNP_LOCAL_BACKUP_DIR ??
      join(
        runtimeCwd,
        cwdOffset,
        "backups"
      )
  );
  return { databasePath, backupDirectory };
}

function assertLocalTarget(path: string): void {
  if (!isAbsolute(path) || !basename(path)) {
    throw new Error("Caminho de dados local inválido.");
  }
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function iso(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function sanitizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSecrets);
  if (!isRecord(value)) return value;
  const next: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    next[key] = sanitizeSecrets(child);
  }
  return next;
}

function mergeArrays(existing: unknown[], incoming: unknown[]): unknown[] {
  const keyed = new Map<string, unknown>();
  const loose: unknown[] = [];
  const add = (item: unknown, preferIncoming: boolean) => {
    if (!isRecord(item)) {
      if (!loose.some((value) => json(value) === json(item))) loose.push(item);
      return;
    }
    const keyValue = item.id ?? item.batchId ?? item.operationId ??
      item.normalizedEmail ?? item.email ?? item.leadId;
    if (typeof keyValue !== "string" || !keyValue) {
      loose.push(item);
      return;
    }
    const previous = keyed.get(keyValue);
    if (!previous) {
      keyed.set(keyValue, item);
      return;
    }
    if (!preferIncoming || !isRecord(previous)) return;
    const previousAt = String(previous.updatedAt ?? previous.lastActivityAt ?? previous.createdAt ?? "");
    const incomingAt = String(item.updatedAt ?? item.lastActivityAt ?? item.createdAt ?? "");
    keyed.set(keyValue, incomingAt >= previousAt ? safeMerge(previous, item) : safeMerge(item, previous));
  };
  existing.forEach((item) => add(item, false));
  incoming.forEach((item) => add(item, true));
  return [...keyed.values(), ...loose];
}

function safeMerge(existing: unknown, incoming: unknown): unknown {
  if (!hasValue(incoming)) return existing;
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return incoming.length ? mergeArrays(existing, incoming) : existing;
  }
  if (isRecord(existing) && isRecord(incoming)) {
    const next: JsonRecord = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      next[key] = key in existing ? safeMerge(existing[key], value) : value;
    }
    return next;
  }
  return incoming;
}

function stateFromPersisted(value: unknown): JsonRecord {
  if (!isRecord(value)) return {};
  return isRecord(value.state) ? value.state : value;
}

function validSignature(record: unknown): record is OfficialSignatureRecord {
  if (!isRecord(record)) return false;
  const operation = record.operationId;
  const html = typeof record.html === "string" ? record.html.trim() : "";
  return (operation === "panek-puglesi" || operation === "modeclean") &&
    html.length > 0 &&
    !(record.enabled === true && html.length === 0);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "file";
}

function weekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return String(utc.getUTCFullYear()) + "-W" + String(week).padStart(2, "0");
}

export class LocalDatabaseAdapter {
  readonly databasePath: string;
  readonly backupDirectory: string;
  private database: DatabaseSync;
  private readonly now: () => Date;

  constructor(options: LocalDatabaseOptions = {}) {
    if (process.env.VERCEL === "1" && !options.allowVercel) {
      throw new Error("SQLite local indisponível no runtime Vercel.");
    }
    const paths = resolveLocalDataPaths(options);
    assertLocalTarget(paths.databasePath);
    assertLocalTarget(paths.backupDirectory);
    this.databasePath = paths.databasePath;
    this.backupDirectory = paths.backupDirectory;
    this.now = options.now ?? (() => new Date());
    mkdirSync(dirname(this.databasePath), { recursive: true });
    mkdirSync(this.backupDirectory, { recursive: true });
    this.database = this.open();
    this.applySchema();
  }

  private open(): DatabaseSync {
    const database = new DatabaseSync(this.databasePath);
    database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    return database;
  }

  close(): void {
    this.database.close();
  }

  private applySchema(): void {
    this.database.exec([
      "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS commercial_state (store_key TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', domain TEXT, email TEXT, phone TEXT, location TEXT, sector TEXT, source TEXT, score REAL, batch_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS search_history (id TEXT PRIMARY KEY, keyword TEXT NOT NULL, location TEXT NOT NULL, results_count INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS search_batches (batch_id TEXT PRIMARY KEY, status TEXT NOT NULL, current_stage TEXT NOT NULL, location TEXT NOT NULL, sectors_input TEXT NOT NULL, last_activity_at TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS search_sectors (batch_id TEXT NOT NULL, sector_index INTEGER NOT NULL, sector TEXT NOT NULL, status TEXT NOT NULL, error TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(batch_id, sector_index), FOREIGN KEY(batch_id) REFERENCES search_batches(batch_id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS search_batch_leads (batch_id TEXT NOT NULL, lead_id TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(batch_id, lead_id), FOREIGN KEY(batch_id) REFERENCES search_batches(batch_id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS campaigns (campaign_id TEXT PRIMARY KEY, operation TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS templates (template_id TEXT PRIMARY KEY, operation TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS signatures (operation_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, html TEXT NOT NULL, plain_text TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, CHECK(enabled = 0 OR length(trim(html)) > 0))",
      "CREATE TABLE IF NOT EXISTS blocklist (entry_id TEXT PRIMARY KEY, email TEXT NOT NULL, operation TEXT NOT NULL, reason TEXT NOT NULL, payload_json TEXT NOT NULL, blocked_at TEXT NOT NULL, UNIQUE(email, operation))",
      "CREATE TABLE IF NOT EXISTS attachments (campaign_id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, file_path TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(campaign_id) REFERENCES campaigns(campaign_id) ON DELETE CASCADE)",
      "CREATE TABLE IF NOT EXISTS send_history (id TEXT PRIMARY KEY, intent_key TEXT NOT NULL UNIQUE, campaign_id TEXT, lead_id TEXT, email TEXT NOT NULL, operation TEXT NOT NULL, contact_kind TEXT NOT NULL DEFAULT 'first_contact', attempted_at TEXT NOT NULL, confirmed_at TEXT, provider_message_id TEXT, status TEXT NOT NULL, error TEXT, payload_json TEXT NOT NULL DEFAULT '{}')",
      "CREATE UNIQUE INDEX IF NOT EXISTS send_history_provider_id ON send_history(provider_message_id) WHERE provider_message_id IS NOT NULL AND provider_message_id <> ''",
      "CREATE TABLE IF NOT EXISTS dedupe_history (dedupe_key TEXT PRIMARY KEY, email TEXT NOT NULL, operation TEXT NOT NULL, campaign_id TEXT, provider_message_id TEXT, confirmed_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS tracking_events (event_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL, email TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS non_secret_settings (setting_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ].join(";") + ";");
    this.setMetadata("schemaVersion", "1", false);
    if (!this.getMetadata("migrationVersion")) {
      this.setMetadata("migrationVersion", "0", false);
    }
    if (!this.getMetadata("changeCounter")) {
      this.setMetadata("changeCounter", "0", false);
    }
  }

  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve original failure.
      }
      throw error;
    }
  }

  private getMetadata(key: string): string | null {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value?: unknown } | undefined;
    return typeof row?.value === "string" ? row.value : null;
  }

  private setMetadata(key: string, value: string, touch = true): void {
    const now = this.now().toISOString();
    this.database.prepare("INSERT INTO metadata(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, value, now);
    if (touch && key !== "changeCounter" && key !== "lastBackupAt" && key !== "lastBackupCounter") {
      const current = Number(this.getMetadata("changeCounter") ?? "0");
      this.database.prepare("INSERT INTO metadata(key,value,updated_at) VALUES('changeCounter',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(String(current + 1), now);
    }
  }

  assertWritable(): void {
    this.database.exec("SAVEPOINT pnp_write_probe");
    try {
      this.database.prepare(
        "INSERT INTO metadata(key,value,updated_at) VALUES('__write_test','1',?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at"
      ).run(this.now().toISOString());
    } finally {
      try {
        this.database.exec("ROLLBACK TO pnp_write_probe");
      } catch {
        // Preserve the original write failure.
      }
      try {
        this.database.exec("RELEASE pnp_write_probe");
      } catch {
        // Preserve the original write failure.
      }
    }
  }

  private readStore(key: CommercialStoreKey): JsonRecord {
    const row = this.database.prepare("SELECT data_json FROM commercial_state WHERE store_key=?").get(key) as { data_json?: unknown } | undefined;
    return parseJson<JsonRecord>(row?.data_json, {});
  }

  private saveStore(key: CommercialStoreKey, raw: unknown, mode: "merge" | "replace"): void {
    const incoming = sanitizeSecrets(stateFromPersisted(raw)) as JsonRecord;
    const existing = this.readStore(key);
    const state = mode === "merge" ? safeMerge(existing, incoming) as JsonRecord : incoming;
    const now = this.now().toISOString();
    this.database.prepare("INSERT INTO commercial_state(store_key,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(store_key) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at").run(key, json(state), now);
    this.indexStore(key, state, now);
    if (mode === "replace") this.synchronizeDeletedEntities(key, state);
  }

  private synchronizeDeletedEntities(
    key: CommercialStoreKey,
    state: JsonRecord
  ): void {
    const deleteMissing = (
      table: string,
      column: string,
      ids: string[]
    ) => {
      if (ids.length === 0) {
        this.database.prepare("DELETE FROM " + table).run();
        return;
      }
      const placeholders = ids.map(() => "?").join(",");
      this.database.prepare(
        "DELETE FROM " + table + " WHERE " + column +
          " NOT IN (" + placeholders + ")"
      ).run(...ids);
    };
    if (key === "pnp-campaigns") {
      const campaigns = asArray<Campaign>(state.campaigns);
      const ids = campaigns.map((item) => item.id).filter(Boolean);
      const removedAttachments = ids.length
        ? this.database.prepare(
            "SELECT file_path FROM attachments WHERE campaign_id NOT IN (" +
              ids.map(() => "?").join(",") + ")"
          ).all(...ids)
        : this.database.prepare("SELECT file_path FROM attachments").all();
      deleteMissing("campaigns", "campaign_id", ids);
      const attachmentRoot = resolve(dirname(this.databasePath), "attachments");
      for (const row of removedAttachments as Array<{ file_path?: unknown }>) {
        if (typeof row.file_path !== "string") continue;
        const target = resolve(row.file_path);
        if (dirname(target) === attachmentRoot && existsSync(target)) rmSync(target);
      }
    } else if (key === "pnp-email-templates") {
      deleteMissing(
        "templates",
        "template_id",
        asArray<EmailTemplate>(state.templates).map((item) => item.id).filter(Boolean)
      );
    } else if (key === "pnp-email-blocklist") {
      deleteMissing(
        "blocklist",
        "entry_id",
        asArray<EmailBlocklistEntry>(state.entries).map((item) => item.id).filter(Boolean)
      );
    }
  }

  saveCommercialStore(key: CommercialStoreKey, raw: unknown): void {
    if (!COMMERCIAL_STORE_KEYS.includes(key)) throw new Error("Store comercial inválido.");
    this.transaction(() => {
      this.saveStore(key, raw, "replace");
      this.setMetadata("lastWriteAt", this.now().toISOString());
    });
  }

  private indexStore(key: CommercialStoreKey, state: JsonRecord, now: string): void {
    if (key === "pnp-lead-finder") {
      const allLeads = [
        ...asArray<Lead>(state.savedLeads),
        ...asArray<Lead>(state.importedLeads),
        ...asArray<SearchRecord>(state.fullSearchHistory).flatMap((record) => asArray<Lead>(record.leads)),
      ];
      this.upsertLeads(allLeads, now);
      for (const record of asArray<SearchRecord>(state.fullSearchHistory)) this.upsertSearchRecord(record, now);
    } else if (key === "pnp-campaigns") {
      for (const campaign of asArray<Campaign>(state.campaigns)) this.upsertCampaign(campaign, now);
    } else if (key === "pnp-email-templates") {
      for (const template of asArray<EmailTemplate>(state.templates)) this.upsertTemplate(template, now);
    } else if (key === "pnp-email-blocklist") {
      for (const entry of asArray<EmailBlocklistEntry>(state.entries)) this.upsertBlock(entry);
    } else if (key === "pnp-settings") {
      for (const [settingKey, value] of Object.entries(state)) {
        if (SECRET_KEY.test(settingKey)) continue;
        this.database.prepare("INSERT INTO non_secret_settings(setting_key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").run(settingKey, json(value), now);
      }
    } else if (key === "pnp-agent-three") {
      this.indexAgentThreeHistory(state, now);
    }
  }

  private upsertLeads(leads: Lead[], now: string): void {
    const statement = this.database.prepare("INSERT INTO leads(id,company,domain,email,phone,location,sector,source,score,batch_id,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company=CASE WHEN excluded.company<>'' THEN excluded.company ELSE leads.company END, domain=COALESCE(NULLIF(excluded.domain,''),leads.domain), email=COALESCE(NULLIF(excluded.email,''),leads.email), phone=COALESCE(NULLIF(excluded.phone,''),leads.phone), location=COALESCE(NULLIF(excluded.location,''),leads.location), sector=COALESCE(NULLIF(excluded.sector,''),leads.sector), source=COALESCE(NULLIF(excluded.source,''),leads.source), score=COALESCE(excluded.score,leads.score), batch_id=COALESCE(excluded.batch_id,leads.batch_id), payload_json=excluded.payload_json, updated_at=MAX(leads.updated_at,excluded.updated_at)");
    const seen = new Set<string>();
    for (const lead of leads) {
      if (!lead?.id || seen.has(lead.id)) continue;
      seen.add(lead.id);
      let domain = "";
      try {
        domain = lead.website ? new URL(lead.website.startsWith("http") ? lead.website : "https://" + lead.website).hostname : "";
      } catch {
        domain = lead.website ?? "";
      }
      const updatedAt = iso(lead.lastProcessedAt ?? lead.savedAt, now);
      statement.run(lead.id, lead.company ?? "", domain, lead.email ?? null, lead.phone ?? "", lead.address ?? "", lead.category ?? "", "browser-migration", Number.isFinite(lead.aiScore) ? lead.aiScore : null, lead.batchId ?? null, json(lead), iso(lead.savedAt, updatedAt), updatedAt);
    }
  }

  private upsertSearchRecord(record: SearchRecord, now: string): void {
    if (!record?.id) return;
    const created = iso(record.date, now);
    this.database.prepare("INSERT INTO search_history(id,keyword,location,results_count,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET keyword=CASE WHEN excluded.keyword<>'' THEN excluded.keyword ELSE search_history.keyword END, location=CASE WHEN excluded.location<>'' THEN excluded.location ELSE search_history.location END, results_count=MAX(search_history.results_count,excluded.results_count), payload_json=excluded.payload_json, updated_at=MAX(search_history.updated_at,excluded.updated_at)").run(record.id, record.keyword ?? "", record.location ?? "", record.resultsCount ?? 0, json(record), created, created);
    this.upsertLeads(asArray<Lead>(record.leads), now);
  }

  private persistAttachment(campaign: Campaign, now: string): Campaign {
    const attachment = campaign.attachment;
    if (!attachment?.dataUrl?.includes(",")) return campaign;
    const comma = attachment.dataUrl.indexOf(",");
    const header = attachment.dataUrl.slice(0, comma);
    if (!header.includes(";base64")) return campaign;
    const content = Buffer.from(attachment.dataUrl.slice(comma + 1), "base64");
    const directory = join(dirname(this.databasePath), "attachments");
    mkdirSync(directory, { recursive: true });
    const suffix = extname(attachment.name) || ".bin";
    const filePath = resolve(directory, safeFilePart(campaign.id) + suffix);
    if (dirname(filePath) !== resolve(directory)) throw new Error("Caminho de anexo inválido.");
    writeFileSync(filePath, content);
    this.database.prepare("INSERT INTO attachments(campaign_id,name,mime_type,size_bytes,file_path,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,file_path=excluded.file_path,updated_at=excluded.updated_at").run(campaign.id, attachment.name, attachment.mimeType, content.byteLength, filePath, now);
    return { ...campaign, attachment: { ...attachment, dataUrl: "" } };
  }

  private upsertCampaign(campaign: Campaign, now: string): void {
    if (!campaign?.id) return;
    const stored = this.persistAttachment(campaign, now);
    this.database.prepare("INSERT INTO campaigns(campaign_id,operation,name,status,subject,body,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET operation=excluded.operation,name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE campaigns.name END,status=CASE WHEN campaigns.status IN ('completed','active') AND excluded.status='draft' THEN campaigns.status ELSE excluded.status END,subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE campaigns.subject END,body=CASE WHEN excluded.body<>'' THEN excluded.body ELSE campaigns.body END,payload_json=excluded.payload_json,updated_at=MAX(campaigns.updated_at,excluded.updated_at)").run(campaign.id, campaign.campaignProfileId ?? "panek-puglesi", campaign.name ?? "", campaign.status ?? "draft", campaign.subject ?? "", campaign.body ?? "", json(stored), iso(campaign.createdAt, now), iso(campaign.updatedAt, now));
    for (const delivery of asArray<Campaign["leadStatuses"][number]>(campaign.leadStatuses)) {
      if (delivery.status !== "sent" || !delivery.providerMessageId) continue;
      const leadRow = this.database.prepare("SELECT email FROM leads WHERE id=?").get(delivery.leadId) as { email?: unknown } | undefined;
      const email = typeof leadRow?.email === "string" ? leadRow.email : "";
      this.upsertConfirmedHistory({
        campaignId: campaign.id,
        leadId: delivery.leadId,
        email,
        operation: campaign.campaignProfileId,
        contactKind: campaign.contactKind ?? "first_contact",
        attemptedAt: delivery.sentAt ?? now,
        confirmedAt: delivery.sentAt ?? now,
        providerMessageId: delivery.providerMessageId,
      });
    }
  }

  private upsertTemplate(template: EmailTemplate, now: string): void {
    if (!template?.id || !template.operation) return;
    this.database.prepare("INSERT INTO templates(template_id,operation,name,subject,body,is_default,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(template_id) DO UPDATE SET operation=excluded.operation,name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE templates.name END,subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE templates.subject END,body=CASE WHEN excluded.body<>'' THEN excluded.body ELSE templates.body END,is_default=excluded.is_default,payload_json=excluded.payload_json,updated_at=MAX(templates.updated_at,excluded.updated_at)").run(template.id, template.operation, template.name ?? "", template.subject ?? "", template.body ?? "", template.isDefault ? 1 : 0, json(template), iso(template.createdAt, now), iso(template.updatedAt, now));
  }

  private upsertBlock(entry: EmailBlocklistEntry): void {
    if (!entry?.id || !entry.normalizedEmail) return;
    this.database.prepare("INSERT INTO blocklist(entry_id,email,operation,reason,payload_json,blocked_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email,operation) DO UPDATE SET entry_id=excluded.entry_id,reason=excluded.reason,payload_json=excluded.payload_json,blocked_at=MIN(blocklist.blocked_at,excluded.blocked_at)").run(entry.id, entry.normalizedEmail, entry.operation ?? "both", entry.reason ?? "manual", json(entry), entry.blockedAt);
  }

  private indexAgentThreeHistory(state: JsonRecord, now: string): void {
    if (!isRecord(state.operations)) return;
    for (const [operation, raw] of Object.entries(state.operations)) {
      if (!isRecord(raw)) continue;
      for (const item of [...asArray<JsonRecord>(raw.queue), ...asArray<JsonRecord>(raw.sentIndex)]) {
        const messageId = typeof item.providerMessageId === "string" ? item.providerMessageId : "";
        if (!messageId) continue;
        this.upsertConfirmedHistory({
          campaignId: typeof item.campaignId === "string" ? item.campaignId : null,
          leadId: typeof item.leadId === "string" ? item.leadId : null,
          email: typeof item.normalizedEmail === "string" ? item.normalizedEmail : "",
          operation,
          contactKind: "first_contact",
          attemptedAt: iso(item.sentAt, now),
          confirmedAt: iso(item.sentAt, now),
          providerMessageId: messageId,
        });
      }
    }
  }

  private upsertConfirmedHistory(input: {
    campaignId: string | null;
    leadId: string | null;
    email: string;
    operation: string;
    contactKind: string;
    attemptedAt: string;
    confirmedAt: string;
    providerMessageId: string;
  }): void {
    const intentKey = [input.operation, input.campaignId ?? "", input.leadId ?? "", input.contactKind, input.providerMessageId].join("|");
    const id = "send-" + Buffer.from(intentKey).toString("base64url").slice(0, 80);
    this.database.prepare("INSERT INTO send_history(id,intent_key,campaign_id,lead_id,email,operation,contact_kind,attempted_at,confirmed_at,provider_message_id,status,error,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,'', '{}') ON CONFLICT(intent_key) DO UPDATE SET confirmed_at=COALESCE(send_history.confirmed_at,excluded.confirmed_at),provider_message_id=COALESCE(send_history.provider_message_id,excluded.provider_message_id),status='confirmed'").run(id, intentKey, input.campaignId, input.leadId, input.email.toLowerCase(), input.operation, input.contactKind, input.attemptedAt, input.confirmedAt, input.providerMessageId, "confirmed");
    const dedupeKey = [input.operation, input.email.toLowerCase(), input.contactKind].join("|");
    this.database.prepare("INSERT INTO dedupe_history(dedupe_key,email,operation,campaign_id,provider_message_id,confirmed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO UPDATE SET campaign_id=excluded.campaign_id,provider_message_id=COALESCE(excluded.provider_message_id,dedupe_history.provider_message_id),confirmed_at=MAX(dedupe_history.confirmed_at,excluded.confirmed_at)").run(dedupeKey, input.email.toLowerCase(), input.operation, input.campaignId, input.providerMessageId, input.confirmedAt);
  }

  putSignatures(records: readonly OfficialSignatureRecord[]): void {
    this.transaction(() => {
      const statement = this.database.prepare("INSERT INTO signatures(operation_id,enabled,html,plain_text,version,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET enabled=excluded.enabled,html=CASE WHEN length(trim(excluded.html))>0 THEN excluded.html ELSE signatures.html END,plain_text=CASE WHEN length(trim(excluded.plain_text))>0 THEN excluded.plain_text ELSE signatures.plain_text END,version=MAX(signatures.version,excluded.version),updated_at=MAX(signatures.updated_at,excluded.updated_at)");
      for (const record of records) {
        if (!validSignature(record)) continue;
        statement.run(record.operationId, record.enabled ? 1 : 0, record.html, record.plainText ?? "", record.version, record.updatedAt);
      }
      this.setMetadata("lastWriteAt", this.now().toISOString());
    });
  }

  getSignatures(): OfficialSignatureRecord[] {
    const rows = this.database.prepare("SELECT operation_id,enabled,html,plain_text,version,updated_at FROM signatures ORDER BY operation_id").all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      operationId: row.operation_id as OfficialSignatureRecord["operationId"],
      enabled: Number(row.enabled) === 1,
      html: String(row.html),
      plainText: String(row.plain_text),
      version: Number(row.version),
      updatedAt: String(row.updated_at),
    })).filter(validSignature);
  }

  getSignature(operationId: string): OfficialSignatureRecord | null {
    return this.getSignatures().find((item) => item.operationId === operationId) ?? null;
  }

  putSearchBatch(batch: PersistedSearchBatch, leads: Lead[] = []): void {
    this.transaction(() => {
      const now = this.now().toISOString();
      this.database.prepare("INSERT INTO search_batches(batch_id,status,current_stage,location,sectors_input,last_activity_at,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id) DO UPDATE SET status=CASE WHEN search_batches.status LIKE 'completed%' AND excluded.status IN ('running','interrupted') THEN search_batches.status ELSE excluded.status END,current_stage=CASE WHEN search_batches.current_stage='completed' THEN search_batches.current_stage ELSE excluded.current_stage END,location=CASE WHEN excluded.location<>'' THEN excluded.location ELSE search_batches.location END,sectors_input=CASE WHEN excluded.sectors_input<>'' THEN excluded.sectors_input ELSE search_batches.sectors_input END,last_activity_at=MAX(search_batches.last_activity_at,excluded.last_activity_at),payload_json=excluded.payload_json,updated_at=MAX(search_batches.updated_at,excluded.updated_at)").run(batch.batchId, batch.status, batch.currentStage, batch.location, batch.sectorsInput, batch.lastActivityAt, json(batch), batch.createdAt, batch.updatedAt);
      const sectorStatement = this.database.prepare("INSERT INTO search_sectors(batch_id,sector_index,sector,status,error,payload_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(batch_id,sector_index) DO UPDATE SET sector=excluded.sector,status=CASE WHEN search_sectors.status IN ('completed','failed') AND excluded.status IN ('pending','running') THEN search_sectors.status ELSE excluded.status END,error=COALESCE(excluded.error,search_sectors.error),payload_json=excluded.payload_json,updated_at=MAX(search_sectors.updated_at,excluded.updated_at)");
      for (const sector of batch.sectors) sectorStatement.run(batch.batchId, sector.index, sector.sector, sector.status, sector.error ?? null, json(sector), sector.updatedAt);
      const leadStatement = this.database.prepare("INSERT INTO search_batch_leads(batch_id,lead_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(batch_id,lead_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=MAX(search_batch_leads.updated_at,excluded.updated_at)");
      for (const lead of leads) if (lead?.id) leadStatement.run(batch.batchId, lead.id, json({ ...lead, batchId: batch.batchId }), iso(lead.lastProcessedAt, now));
      this.upsertLeads(leads.map((lead) => ({ ...lead, batchId: batch.batchId })), now);
      this.setMetadata("lastWriteAt", now);
    });
  }

  getSearchBatch(batchId: string): LegacySearchBatchSnapshot | null {
    const row = this.database.prepare("SELECT payload_json FROM search_batches WHERE batch_id=?").get(batchId) as { payload_json?: unknown } | undefined;
    if (!row) return null;
    const batch = parseJson<PersistedSearchBatch>(row.payload_json, null as unknown as PersistedSearchBatch);
    if (!batch?.batchId) return null;
    const leadRows = this.database.prepare("SELECT payload_json FROM search_batch_leads WHERE batch_id=? ORDER BY lead_id").all(batchId) as Array<{ payload_json?: unknown }>;
    return { batch, leads: leadRows.map((lead) => parseJson<Lead>(lead.payload_json, null as unknown as Lead)).filter(Boolean) };
  }

  getAllSearchBatches(): LegacySearchBatchSnapshot[] {
    const rows = this.database.prepare("SELECT batch_id FROM search_batches ORDER BY updated_at DESC").all() as Array<{ batch_id?: unknown }>;
    return rows.map((row) => this.getSearchBatch(String(row.batch_id))).filter((value): value is LegacySearchBatchSnapshot => Boolean(value));
  }

  mergeLegacySnapshot(snapshot: LocalDataBridgeSnapshot): { migrated: Record<string, number> } {
    const before = this.counts();
    return this.transaction(() => {
      for (const key of COMMERCIAL_STORE_KEYS) {
        if (key in snapshot.stores) this.saveStore(key, snapshot.stores[key], "merge");
      }
      for (const record of snapshot.indexedDb.signatures) {
        if (!validSignature(record)) continue;
        const existing = this.getSignature(record.operationId);
        if (!existing || record.updatedAt >= existing.updatedAt) {
          this.database.prepare("INSERT INTO signatures(operation_id,enabled,html,plain_text,version,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET enabled=excluded.enabled,html=excluded.html,plain_text=excluded.plain_text,version=MAX(signatures.version,excluded.version),updated_at=MAX(signatures.updated_at,excluded.updated_at)").run(record.operationId, record.enabled ? 1 : 0, record.html, record.plainText ?? "", record.version, record.updatedAt);
        }
      }
      for (const item of snapshot.indexedDb.searchBatches) {
        if (!item?.batch?.batchId) continue;
        const existing = this.getSearchBatch(item.batch.batchId);
        const batch = existing ? safeMerge(existing.batch, item.batch) as PersistedSearchBatch : item.batch;
        const leads = existing ? mergeArrays(existing.leads, item.leads) as Lead[] : item.leads;
        this.putSearchBatchWithinTransaction(batch, leads);
      }
      this.setMetadata("migrationVersion", String(Math.max(LOCAL_DATA_MIGRATION_VERSION, snapshot.migrationVersion || 0)));
      this.setMetadata("lastMigrationAt", this.now().toISOString());
      const after = this.counts();
      return {
        migrated: Object.fromEntries(Object.keys(after).map((key) => [key, Math.max(0, after[key as keyof typeof after] - before[key as keyof typeof before])])),
      };
    });
  }

  private putSearchBatchWithinTransaction(batch: PersistedSearchBatch, leads: Lead[]): void {
    const now = this.now().toISOString();
    this.database.prepare("INSERT INTO search_batches(batch_id,status,current_stage,location,sectors_input,last_activity_at,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id) DO UPDATE SET status=CASE WHEN search_batches.status LIKE 'completed%' AND excluded.status IN ('running','interrupted') THEN search_batches.status ELSE excluded.status END,current_stage=CASE WHEN search_batches.current_stage='completed' THEN search_batches.current_stage ELSE excluded.current_stage END,last_activity_at=MAX(search_batches.last_activity_at,excluded.last_activity_at),payload_json=excluded.payload_json,updated_at=MAX(search_batches.updated_at,excluded.updated_at)").run(batch.batchId, batch.status, batch.currentStage, batch.location, batch.sectorsInput, batch.lastActivityAt, json(batch), batch.createdAt, batch.updatedAt);
    const sector = this.database.prepare("INSERT INTO search_sectors(batch_id,sector_index,sector,status,error,payload_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(batch_id,sector_index) DO UPDATE SET status=CASE WHEN search_sectors.status IN ('completed','failed') AND excluded.status IN ('pending','running') THEN search_sectors.status ELSE excluded.status END,error=COALESCE(excluded.error,search_sectors.error),payload_json=excluded.payload_json,updated_at=MAX(search_sectors.updated_at,excluded.updated_at)");
    for (const item of batch.sectors) sector.run(batch.batchId, item.index, item.sector, item.status, item.error ?? null, json(item), item.updatedAt);
    const leadStatement = this.database.prepare("INSERT INTO search_batch_leads(batch_id,lead_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(batch_id,lead_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=MAX(search_batch_leads.updated_at,excluded.updated_at)");
    for (const lead of leads) if (lead?.id) leadStatement.run(batch.batchId, lead.id, json({ ...lead, batchId: batch.batchId }), iso(lead.lastProcessedAt, now));
    this.upsertLeads(leads, now);
  }

  hydration(): LocalDataHydration {
    const stores: LocalDataHydration["stores"] = {};
    for (const key of COMMERCIAL_STORE_KEYS) {
      const state = this.readStore(key);
      if (Object.keys(state).length) stores[key] = state;
    }
    const campaignRows = this.database.prepare("SELECT payload_json,campaign_id FROM campaigns ORDER BY updated_at DESC").all() as Array<{ payload_json: unknown; campaign_id: unknown }>;
    if (campaignRows.length) {
      const campaigns = campaignRows.map((row) => this.hydrateCampaign(parseJson<Campaign>(row.payload_json, null as unknown as Campaign), String(row.campaign_id))).filter(Boolean);
      stores["pnp-campaigns"] = { ...stateFromPersisted(stores["pnp-campaigns"]), campaigns };
    }
    const leadRows = this.database.prepare("SELECT payload_json FROM leads ORDER BY updated_at DESC").all() as Array<{ payload_json: unknown }>;
    const historyRows = this.database.prepare("SELECT payload_json FROM search_history ORDER BY updated_at DESC").all() as Array<{ payload_json: unknown }>;
    if (leadRows.length || historyRows.length) {
      const existing = stateFromPersisted(stores["pnp-lead-finder"]);
      stores["pnp-lead-finder"] = {
        ...existing,
        savedLeads: leadRows.map((row) => parseJson<Lead>(row.payload_json, null as unknown as Lead)).filter(Boolean),
        fullSearchHistory: historyRows.map((row) => parseJson<SearchRecord>(row.payload_json, null as unknown as SearchRecord)).filter(Boolean),
      };
    }
    const templates = this.database.prepare("SELECT payload_json FROM templates ORDER BY updated_at DESC").all() as Array<{ payload_json: unknown }>;
    if (templates.length) stores["pnp-email-templates"] = { templates: templates.map((row) => parseJson<EmailTemplate>(row.payload_json, null as unknown as EmailTemplate)).filter(Boolean) };
    const blocks = this.database.prepare("SELECT payload_json FROM blocklist ORDER BY blocked_at DESC").all() as Array<{ payload_json: unknown }>;
    if (blocks.length) stores["pnp-email-blocklist"] = { entries: blocks.map((row) => parseJson<EmailBlocklistEntry>(row.payload_json, null as unknown as EmailBlocklistEntry)).filter(Boolean) };
    return {
      migrationVersion: Number(this.getMetadata("migrationVersion") ?? "0"),
      stores,
      signatures: this.getSignatures(),
      searchBatches: this.getAllSearchBatches(),
    };
  }

  private hydrateCampaign(campaign: Campaign, campaignId: string): Campaign | null {
    if (!campaign?.id) return null;
    const row = this.database.prepare("SELECT name,mime_type,size_bytes,file_path FROM attachments WHERE campaign_id=?").get(campaignId) as Record<string, unknown> | undefined;
    if (!row || typeof row.file_path !== "string" || !existsSync(row.file_path)) return campaign;
    const mimeType = String(row.mime_type);
    const dataUrl =
      "data:" +
      mimeType +
      ";base64," +
      readFileSync(/* turbopackIgnore: true */ row.file_path).toString("base64");
    return { ...campaign, attachment: { name: String(row.name), mimeType, sizeBytes: Number(row.size_bytes), dataUrl } };
  }

  createSendIntent(input: AgentThreeSendRequest): SendIntent {
    this.assertWritable();
    const intentKey = [input.operation, input.campaignId ?? "", input.leadId ?? "", input.queueItemId ?? "", input.recipient.toLowerCase()].join("|");
    const existing = this.database.prepare("SELECT id,status,provider_message_id FROM send_history WHERE intent_key=?").get(intentKey) as Record<string, unknown> | undefined;
    if (existing?.status === "confirmed" && typeof existing.provider_message_id === "string") {
      return { id: String(existing.id), intentKey, existingMessageId: existing.provider_message_id };
    }
    const now = this.now().toISOString();
    const id = existing ? String(existing.id) : "intent-" + crypto.randomUUID();
    this.transaction(() => {
      this.database.prepare("INSERT INTO send_history(id,intent_key,campaign_id,lead_id,email,operation,attempted_at,status,payload_json) VALUES(?,?,?,?,?,?,?,'intent',?) ON CONFLICT(intent_key) DO UPDATE SET attempted_at=excluded.attempted_at,status='intent',error=NULL,payload_json=excluded.payload_json").run(id, intentKey, input.campaignId ?? null, input.leadId ?? null, input.recipient.trim().toLowerCase(), input.operation, now, json({ queueItemId: input.queueItemId ?? null }));
      this.setMetadata("lastWriteAt", now);
    });
    return { id, intentKey };
  }

  listSendHistory(filters: {
    operation?: string;
    campaignId?: string;
  } = {}): LocalSendHistoryRecord[] {
    const rows = this.database.prepare(
      "SELECT id,intent_key,campaign_id,lead_id,email,operation,contact_kind,attempted_at,confirmed_at,provider_message_id,status,error,payload_json FROM send_history ORDER BY attempted_at"
    ).all() as Array<Record<string, unknown>>;
    return rows
      .map((row) => {
        const payload = parseJson<JsonRecord>(row.payload_json, {});
        const queueItemId =
          typeof payload.queueItemId === "string" ? payload.queueItemId : null;
        const record: LocalSendHistoryRecord = {
          id: String(row.id),
          intentKey: String(row.intent_key ?? ""),
          campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
          leadId: typeof row.lead_id === "string" ? row.lead_id : null,
          email: String(row.email ?? ""),
          operation: String(row.operation ?? ""),
          queueItemId,
          providerMessageId:
            typeof row.provider_message_id === "string"
              ? row.provider_message_id
              : null,
          confirmedAt:
            typeof row.confirmed_at === "string" ? row.confirmed_at : null,
          attemptedAt:
            typeof row.attempted_at === "string" ? row.attempted_at : null,
          status: String(row.status ?? ""),
          error: typeof row.error === "string" ? row.error : null,
        };
        if (filters.operation && record.operation !== filters.operation) {
          return null;
        }
        if (filters.campaignId && record.campaignId !== filters.campaignId) {
          return null;
        }
        return record;
      })
      .filter((record): record is LocalSendHistoryRecord => Boolean(record));
  }

  isSuppressed(operation: string, email: string): boolean {
    const normalized = email.trim().toLowerCase();
    const row = this.database.prepare(
      "SELECT 1 AS blocked FROM blocklist WHERE email=? AND operation IN ('both',?) LIMIT 1"
    ).get(normalized, operation);
    return Boolean(row);
  }

  finishSendIntent(intent: SendIntent, result: AgentThreeSmtpResult): void {
    const now = this.now().toISOString();
    this.transaction(() => {
      if (result.status === "sent" && result.messageId) {
        this.database.prepare("UPDATE send_history SET status='confirmed',confirmed_at=?,provider_message_id=?,error=NULL WHERE id=?").run(now, result.messageId, intent.id);
        const row = this.database.prepare("SELECT email,operation,campaign_id,lead_id,contact_kind,attempted_at FROM send_history WHERE id=?").get(intent.id) as Record<string, unknown>;
        const dedupeKey = [
          String(row.operation),
          String(row.email ?? "").toLowerCase(),
          String(row.contact_kind ?? "first_contact"),
        ].join("|");
        this.database.prepare(
          "INSERT INTO dedupe_history(dedupe_key,email,operation,campaign_id,provider_message_id,confirmed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO UPDATE SET campaign_id=excluded.campaign_id,provider_message_id=COALESCE(excluded.provider_message_id,dedupe_history.provider_message_id),confirmed_at=MAX(dedupe_history.confirmed_at,excluded.confirmed_at)"
        ).run(
          dedupeKey,
          String(row.email ?? "").toLowerCase(),
          String(row.operation),
          typeof row.campaign_id === "string" ? row.campaign_id : null,
          result.messageId,
          now
        );
      } else {
        this.database.prepare("UPDATE send_history SET status='failed',error=? WHERE id=?").run(result.message, intent.id);
      }
      this.setMetadata("lastWriteAt", now);
    });
  }

  counts() {
    const count = (table: string, where = "") => {
      const row = this.database.prepare("SELECT COUNT(*) AS total FROM " + table + where).get() as { total: number | bigint };
      return Number(row.total);
    };
    return {
      leads: count("leads"),
      campaigns: count("campaigns"),
      searchHistory: count("search_history"),
      confirmedSends: count("send_history", " WHERE status='confirmed'"),
      blocklist: count("blocklist"),
      templates: count("templates"),
    };
  }

  recordTrackingEvent(event: CampaignTrackingEvent): void {
    this.transaction(() => {
      this.database.prepare(
        "INSERT INTO tracking_events(event_id,campaign_id,lead_id,email,event_type,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING"
      ).run(
        event.id,
        event.campaignId,
        event.leadId,
        event.email,
        event.type,
        event.occurredAt,
        json(event)
      );
      this.setMetadata("lastWriteAt", this.now().toISOString());
    });
  }

  listTrackingEvents(campaignId?: string): CampaignTrackingEvent[] {
    const rows = campaignId
      ? this.database.prepare(
          "SELECT payload_json FROM tracking_events WHERE campaign_id=? ORDER BY occurred_at"
        ).all(campaignId)
      : this.database.prepare(
          "SELECT payload_json FROM tracking_events ORDER BY occurred_at"
        ).all();
    return (rows as Array<{ payload_json: unknown }>)
      .map((row) =>
        parseJson<CampaignTrackingEvent>(
          row.payload_json,
          null as unknown as CampaignTrackingEvent
        )
      )
      .filter(Boolean);
  }

  async createBackup(): Promise<string> {
    this.assertWritable();
    mkdirSync(this.backupDirectory, { recursive: true });
    const actualNow = this.now();
    let date = actualNow;
    let destination = "";
    do {
      const stamp = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-") + "-" + [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
      ].join("");
      destination = resolve(this.backupDirectory, "pnp-lead-finder-" + stamp + ".sqlite");
      if (existsSync(destination)) date = new Date(date.getTime() + 1000);
    } while (existsSync(destination));
    if (dirname(destination) !== resolve(this.backupDirectory)) throw new Error("Destino de backup inválido.");
    await backup(this.database, destination);
    this.makeStandaloneBackup(destination);
    this.validateDatabaseFile(destination);
    this.setMetadata("lastBackupAt", actualNow.toISOString(), false);
    this.setMetadata("lastBackupCounter", this.getMetadata("changeCounter") ?? "0", false);
    this.applyRetention();
    return destination;
  }

  async ensureDailyBackup(): Promise<string | null> {
    const last = this.getMetadata("lastBackupAt");
    const changed = this.getMetadata("lastBackupCounter") !== this.getMetadata("changeCounter");
    const today = this.now().toISOString().slice(0, 10);
    if (!last || last.slice(0, 10) !== today || changed) return this.createBackup();
    return null;
  }

  private applyRetention(): void {
    const files = readdirSync(this.backupDirectory)
      .filter((name) => /^pnp-lead-finder-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/.test(name))
      .map((name) => ({ name, path: resolve(this.backupDirectory, name), date: statSync(resolve(this.backupDirectory, name)).mtime }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const keep = new Set<string>();
    const weeks = new Set<string>();
    for (const file of files.slice(0, 7)) keep.add(file.path);
    for (const file of files) {
      const week = weekKey(file.date);
      if (weeks.size < 4 && !weeks.has(week)) {
        weeks.add(week);
        keep.add(file.path);
      }
    }
    for (const file of files) {
      if (!keep.has(file.path) && dirname(file.path) === resolve(this.backupDirectory)) {
        unlinkSync(file.path);
        for (const suffix of ["-wal", "-shm"]) {
          const sidecar = file.path + suffix;
          if (existsSync(sidecar)) unlinkSync(sidecar);
        }
      }
    }
  }

  private makeStandaloneBackup(path: string): void {
    const standalone = new DatabaseSync(path);
    try {
      standalone.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
    } finally {
      standalone.close();
    }
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = path + suffix;
      if (existsSync(sidecar)) rmSync(sidecar);
    }
  }

  validateDatabaseFile(path: string): void {
    const candidate = resolve(path);
    if (!existsSync(candidate) || extname(candidate).toLowerCase() !== ".sqlite") {
      throw new Error("Arquivo de backup SQLite inválido.");
    }
    const database = new DatabaseSync(candidate, { readOnly: true });
    try {
      const row = database.prepare("PRAGMA integrity_check").get() as Record<string, unknown>;
      if (!Object.values(row).includes("ok")) throw new Error("Falha no integrity_check do backup.");
      database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'").get();
    } finally {
      database.close();
    }
  }

  async restoreFromFile(sourcePath: string): Promise<string> {
    const source = resolve(sourcePath);
    this.validateDatabaseFile(source);
    const preRestore = await this.createBackup();
    const restoreTemp = resolve(dirname(this.databasePath), DATABASE_NAME + ".restore.sqlite");
    if (dirname(restoreTemp) !== dirname(this.databasePath)) throw new Error("Destino de restore inválido.");
    if (existsSync(restoreTemp)) rmSync(restoreTemp);
    const sourceDatabase = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(sourceDatabase, restoreTemp);
    } finally {
      sourceDatabase.close();
    }
    this.makeStandaloneBackup(restoreTemp);
    this.validateDatabaseFile(restoreTemp);
    this.database.close();
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = this.databasePath + suffix;
      if (existsSync(sidecar)) rmSync(sidecar);
    }
    const previousPath = this.databasePath + ".pre-restore";
    if (existsSync(previousPath)) rmSync(previousPath);
    renameSync(this.databasePath, previousPath);
    try {
      renameSync(restoreTemp, this.databasePath);
      this.database = this.open();
      this.applySchema();
      this.assertWritable();
      rmSync(previousPath);
    } catch (error) {
      if (existsSync(this.databasePath)) rmSync(this.databasePath);
      renameSync(previousPath, this.databasePath);
      this.database = this.open();
      throw error;
    }
    return preRestore;
  }

  health(): LocalDataHealth {
    try {
      this.database.prepare("SELECT 1 AS ok").get();
      const migrationVersion = Number(this.getMetadata("migrationVersion") ?? "0");
      this.assertWritable();
      const probe = resolve(this.backupDirectory, ".write-probe");
      writeFileSync(probe, "ok");
      unlinkSync(probe);
      const signatureSet = new Set(this.getSignatures().filter((item) => item.enabled && item.html.trim()).map((item) => item.operationId));
      return {
        ok: true,
        status: "ok",
        writable: true,
        message: "Banco local íntegro e gravável.",
        databasePath: this.databasePath,
        backupPath: this.backupDirectory,
        lastBackup: this.getMetadata("lastBackupAt"),
        sizeBytes: [this.databasePath, this.databasePath + "-wal", this.databasePath + "-shm"]
          .filter(existsSync)
          .reduce((total, file) => total + statSync(file).size, 0),
        migrationVersion,
        counts: this.counts(),
        signatures: {
          "panek-puglesi": signatureSet.has("panek-puglesi"),
          modeclean: signatureSet.has("modeclean"),
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        writable: false,
        message: error instanceof Error ? error.message : "Banco local indisponível.",
        databasePath: this.databasePath,
        backupPath: this.backupDirectory,
        lastBackup: this.getMetadata("lastBackupAt"),
        sizeBytes: existsSync(this.databasePath) ? statSync(this.databasePath).size : 0,
        migrationVersion: Number(this.getMetadata("migrationVersion") ?? "0"),
        counts: EMPTY_COUNTS,
        signatures: { "panek-puglesi": false, modeclean: false },
      };
    }
  }
}

let singleton: LocalDatabaseAdapter | null = null;

export function getLocalDatabase(): LocalDatabaseAdapter {
  if (!singleton) singleton = new LocalDatabaseAdapter();
  return singleton;
}

export function resetLocalDatabaseForTests(): void {
  singleton?.close();
  singleton = null;
}

export function unavailableLocalDataHealth(error: unknown): LocalDataHealth {
  return {
    ok: false,
    status: "error",
    writable: false,
    message: error instanceof Error ? error.message : "Banco local indisponível.",
    databasePath: null,
    backupPath: null,
    lastBackup: null,
    sizeBytes: 0,
    migrationVersion: 0,
    counts: EMPTY_COUNTS,
    signatures: { "panek-puglesi": false, modeclean: false },
  };
}

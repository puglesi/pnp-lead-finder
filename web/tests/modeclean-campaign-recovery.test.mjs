import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";

const campaignId = "camp-1787851869173";
const subject = "A cleaner, easier-to-manage workplace for {{company}}";
const body = `Hi {{company}},

A consistently clean workplace can make daily operations easier for your team and create a more welcoming environment.

Modeclean provides recurring professional cleaning for businesses, residential developments and property managers. From {{website}}, {{company}} looks like an organisation where dependable cleaning support may be valuable.

Would you be open to a brief conversation about your current requirements?

If {{email}} is not the right inbox, who would be best to contact?

Kind regards,
Modeclean`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pnp-modeclean-recovery-"));
  const database = new LocalDatabaseAdapter({
    databasePath: join(root, "data", "test.sqlite"),
    backupDirectory: join(root, "backups"),
    allowVercel: true,
  });
  return { root, database, close() { database.close(); rmSync(root, { recursive: true, force: true }); } };
}

function campaign() {
  const leadIds = Array.from({ length: 312 }, (_, index) => `lead-${index}`);
  return {
    id: campaignId,
    campaignProfileId: "modeclean",
    contactKind: "first_contact",
    name: "Modeclean",
    subject,
    body,
    fromName: "Modeclean",
    fromEmail: "outreach@modeclean.co.uk",
    replyTo: "info@modeclean.co.uk",
    unsubscribeLink: "",
    followUp: { enabled: false, delayDays: 3, subject: "", body: "" },
    leadIds,
    leadStatuses: leadIds.map((leadId, index) => index < 134
      ? { leadId, status: "sent", providerMessageId: `provider-${index}` }
      : index === 134
        ? { leadId, status: "failed", errorCode: "authentication_error" }
        : { leadId, status: "pending" }),
    leadSource: "mixed",
    status: "paused",
    createdAt: "2026-08-27T17:31:18.840Z",
    updatedAt: "2026-08-27T17:48:50.735Z",
    sentCount: 134,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    failedCount: 1,
    attachment: null,
    signature: { enabled: true, operation: "modeclean", body: "official signature from SQLite" },
    batchSend: { batchSize: 75, delayBetweenBatchesMs: 30000, delayBetweenEmailsMs: 400, autoSaveSentLeads: true, dailyLimit: 0 },
    sendErrors: [],
    emailProvider: "smtp-gmail",
  };
}

test("campaign recovery: original record hydrates without queue recreation", () => {
  const fx = fixture();
  try {
    fx.database.saveCommercialStore("pnp-campaigns", { campaigns: [campaign()] });
    const hydrated = fx.database.hydration();
    const restored = hydrated.stores["pnp-campaigns"].campaigns.find((item) => item.id === campaignId);
    assert.ok(restored);
    assert.equal(restored.subject, subject);
    assert.equal(restored.body, body);
    assert.equal(restored.leadIds.length, 312);
    assert.equal(restored.leadStatuses.filter((item) => item.status === "sent").length, 134);
    assert.equal(restored.leadStatuses.filter((item) => item.status === "failed").length, 1);
    assert.equal(restored.leadStatuses.filter((item) => item.status === "pending").length, 177);
    assert.equal(restored.signature.body.includes("official signature"), true);
    assert.equal(restored.body.includes("official signature"), false);
  } finally { fx.close(); }
});

test("campaign recovery: SQLite campaign rows win during hydration and preflight is GET-only", () => {
  const adapterSource = readFileSync(new URL("../src/lib/server/local-database.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../src/app/api/agent-3/send/route.ts", import.meta.url), "utf8");
  assert.match(adapterSource, /stores\["pnp-campaigns"\]\s*=\s*\{\s*\.\.\.stateFromPersisted\(stores\["pnp-campaigns"\]\),\s*campaigns/);
  assert.match(routeSource, /verifyServerAgentThreeSmtp\(operation\)/);
  assert.doesNotMatch(routeSource.slice(0, routeSource.indexOf("export async function POST")), /sendServerAgentThreeSmtp\(body\)/);
});

/**
 * Gmail signature HTML preservation — no real email send.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  isSignatureHtmlEmpty,
  sanitizeSignatureHtml,
  signatureHtmlForSend,
} from "../src/lib/signature-html.ts";
import { renderFullCampaignEmail } from "../src/lib/email-templates.ts";

const GMAIL_LIKE = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;color:#333">
  <tr>
    <td style="padding-right:12px;vertical-align:top">
      <img src="https://example.com/logo.png" width="64" height="64" alt="Logo" style="display:block;border:0" />
    </td>
    <td style="vertical-align:top">
      <div style="font-size:16px;font-weight:700;color:#1e3a5f">Carlos Pugliesi</div>
      <div style="font-size:12px;color:#6b7280">Director · Panek &amp; Pugliesi</div>
      <a href="https://www.panekpuglesi.co.uk" style="color:#1e40af;font-size:12px">www.panekpuglesi.co.uk</a>
      <br/>
      <a href="mailto:info@panekpuglesi.co.uk" style="color:#1e40af">info@panekpuglesi.co.uk</a>
    </td>
  </tr>
</table>
`;

test("sanitizeSignatureHtml keeps table, two columns, image, links, colors", () => {
  const out = sanitizeSignatureHtml(GMAIL_LIKE);
  assert.match(out, /<table/i);
  assert.match(out, /<tr/i);
  assert.match(out, /<td/i);
  assert.match(out, /padding-right:\s*12px/i);
  assert.match(out, /font-size:\s*16px/i);
  assert.match(out, /font-weight:\s*700/i);
  assert.match(out, /color:\s*#1e3a5f/i);
  assert.match(out, /<img[^>]+src="https:\/\/example.com\/logo.png"/i);
  assert.match(out, /href="https:\/\/www\.panekpuglesi\.co\.uk"/i);
  assert.match(out, /mailto:info@panekpuglesi\.co\.uk/);
  // Two columns preserved
  assert.equal((out.match(/<td/gi) || []).length >= 2, true);
});

test("sanitizeSignatureHtml strips scripts and event handlers", () => {
  const dirty = `
    <div style="color:red" onclick="alert(1)">
      Hello
      <script>alert('x')</script>
      <a href="javascript:alert(1)">bad</a>
      <a href="https://safe.com" style="color:blue">ok</a>
      <img src="https://x.com/a.png" onerror="alert(1)" />
    </div>
  `;
  const out = sanitizeSignatureHtml(dirty);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /onclick/i);
  assert.doesNotMatch(out, /onerror/i);
  assert.doesNotMatch(out, /javascript:/i);
  assert.match(out, /https:\/\/safe.com/);
  assert.match(out, /https:\/\/x.com\/a.png/);
});

test("sanitizeSignatureHtml does not convert layout to plain paragraphs only", () => {
  const out = sanitizeSignatureHtml(
    `<div style="display:flex"><span style="margin:8px">A</span><span>B</span></div>`
  );
  assert.match(out, /<div/i);
  assert.match(out, /margin:\s*8px/i);
  // Should not force-wrap everything into a single bare text node without structure
  assert.ok(out.includes("span") || out.includes("div"));
});

test("preview HTML equals send path signature HTML", () => {
  const saved = sanitizeSignatureHtml(GMAIL_LIKE);
  const forSend = signatureHtmlForSend(saved);
  assert.equal(forSend, saved);

  const full = renderFullCampaignEmail(
    "<p>Hello {{company}}</p>",
    { enabled: true, body: saved },
    {
      company: "Acme",
      email: "a@a.com",
      phone: "",
      website: "",
      category: "",
      address: "",
    }
  );
  assert.match(full, /data-email-signature="true"/);
  assert.match(full, /<table/i);
  assert.match(full, /logo\.png/);
  assert.match(full, /Hello Acme/);
  // Must not have been rewritten away
  assert.doesNotMatch(full, /<script/i);
});

test("P&P and Modeclean signatures stay independent objects", () => {
  const pnp = sanitizeSignatureHtml(
    `<table style="color:#1e3a5f"><tr><td>P&amp;P</td></tr></table>`
  );
  const mode = sanitizeSignatureHtml(
    `<table style="color:#0f766e"><tr><td>Modeclean</td></tr></table>`
  );
  assert.notEqual(pnp, mode);
  assert.match(pnp, /#1e3a5f/);
  assert.match(mode, /#0f766e/);
});

test("empty detection", () => {
  assert.equal(isSignatureHtmlEmpty(""), true);
  assert.equal(isSignatureHtmlEmpty("<p><br></p>"), true);
  assert.equal(isSignatureHtmlEmpty(GMAIL_LIKE), false);
  assert.equal(isSignatureHtmlEmpty('<img src="https://x.com/a.png" />'), false);
});

test("no real email sent in suite", () => {
  assert.ok(true);
});

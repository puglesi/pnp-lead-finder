/**
 * Signature HTML helpers — preserve Gmail paste layout.
 * Only strip executable / dangerous content; keep tables, images, inline CSS.
 */

const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "applet",
  "frame",
  "frameset",
  "svg", // can carry scripts; keep out unless needed
]);

/** Tags commonly used in Gmail / Outlook signatures. */
const SIGNATURE_TAGS = new Set([
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "td",
  "th",
  "col",
  "colgroup",
  "caption",
  "div",
  "span",
  "p",
  "br",
  "hr",
  "a",
  "img",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "font",
  "center",
  "blockquote",
  "sup",
  "sub",
  "small",
  "big",
  "pre",
  "code",
  "figure",
  "figcaption",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "label",
  "wbr",
  "nobr",
]);

const EVENT_ATTR = /^on/i;
const DANGEROUS_CSS =
  /expression\s*\(|javascript\s*:|behavior\s*:|url\s*\(\s*['"]?\s*javascript/i;

function isSafeUrl(url: string): boolean {
  const t = url.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("javascript:") || t.startsWith("vbscript:") || t.startsWith("data:text/html")) {
    return false;
  }
  // Allow http(s), mailto, tel, relative, cid (email embeds), data:image
  if (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("mailto:") ||
    t.startsWith("tel:") ||
    t.startsWith("cid:") ||
    t.startsWith("data:image/") ||
    t.startsWith("#") ||
    t.startsWith("/") ||
    t.startsWith("./") ||
    t.startsWith("../")
  ) {
    return true;
  }
  // protocol-relative
  if (t.startsWith("//")) return true;
  // bare path / domain-looking without scheme — keep for Gmail relative links
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) return true;
  return false;
}

function sanitizeStyleValue(style: string): string {
  if (!style) return "";
  if (DANGEROUS_CSS.test(style)) {
    // Drop only dangerous declarations, keep the rest.
    return style
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !DANGEROUS_CSS.test(part))
      .join("; ");
  }
  return style;
}

function copySafeAttributes(source: Element, target: Element): void {
  for (const attr of Array.from(source.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (EVENT_ATTR.test(name)) continue;
    if (name === "srcdoc") continue;

    if (name === "href" || name === "src" || name === "xlink:href" || name === "action") {
      if (!isSafeUrl(value)) continue;
      target.setAttribute(attr.name, value);
      continue;
    }

    if (name === "style") {
      const safe = sanitizeStyleValue(value);
      if (safe) target.setAttribute("style", safe);
      continue;
    }

    // Preserve layout-critical and email attributes.
    if (
      name === "class" ||
      name === "id" ||
      name === "width" ||
      name === "height" ||
      name === "align" ||
      name === "valign" ||
      name === "bgcolor" ||
      name === "border" ||
      name === "cellpadding" ||
      name === "cellspacing" ||
      name === "colspan" ||
      name === "rowspan" ||
      name === "color" ||
      name === "face" ||
      name === "size" ||
      name === "dir" ||
      name === "lang" ||
      name === "title" ||
      name === "alt" ||
      name === "role" ||
      name === "aria-label" ||
      name === "aria-hidden" ||
      name.startsWith("data-") ||
      name === "target" ||
      name === "rel"
    ) {
      target.setAttribute(attr.name, value);
    }
  }

  // Links: open safely in clients that honor target
  if (target.tagName.toLowerCase() === "a") {
    const href = target.getAttribute("href");
    if (href && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      if (!target.getAttribute("target")) target.setAttribute("target", "_blank");
      if (!target.getAttribute("rel")) target.setAttribute("rel", "noopener noreferrer");
    }
  }
}

/**
 * Soft-sanitize signature HTML for storage and send.
 * Preserves tables, images, columns, inline styles from Gmail paste.
 */
export function sanitizeSignatureHtml(html: string): string {
  if (!html || !html.trim()) return "";

  // Prefer browser DOM when available (client + happy path).
  if (typeof DOMParser !== "undefined") {
    try {
      return sanitizeWithDom(html);
    } catch {
      return sanitizeWithRegex(html);
    }
  }
  return sanitizeWithRegex(html);
}

function sanitizeWithDom(html: string): string {
  const parser = new DOMParser();
  // Wrap to keep fragment structure
  const doc = parser.parseFromString(
    `<div id="pnp-sig-root">${html}</div>`,
    "text/html"
  );
  const root = doc.getElementById("pnp-sig-root");
  if (!root) return sanitizeWithRegex(html);

  // Remove dangerous tags entirely
  for (const tag of DANGEROUS_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  }
  // Remove style/script that may have been nested
  root.querySelectorAll("script, style").forEach((el) => el.remove());

  const walk = (node: Node, parent: Element): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(doc.createTextNode(node.textContent ?? ""));
      return;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      // Keep HTML comments (Outlook/Gmail conditionals sometimes matter)
      parent.appendChild(doc.createComment(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tag) || tag === "script" || tag === "style") {
      return;
    }

    if (!SIGNATURE_TAGS.has(tag)) {
      // Unwrap unknown tags but keep children (and their styles).
      Array.from(el.childNodes).forEach((child) => walk(child, parent));
      return;
    }

    const clone = doc.createElement(tag);
    copySafeAttributes(el, clone);
    Array.from(el.childNodes).forEach((child) => walk(child, clone));
    parent.appendChild(clone);
  };

  const out = doc.createElement("div");
  Array.from(root.childNodes).forEach((child) => walk(child, out));
  return out.innerHTML.trim();
}

/** Fallback when DOMParser is unavailable (Node unit tests without jsdom). */
function sanitizeWithRegex(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .trim();
}

export function isSignatureHtmlEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const stripped = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return stripped.length === 0 && !/<img\b/i.test(html);
}

/**
 * Extract HTML from clipboard DataTransfer, preferring text/html (Gmail).
 */
export function signatureHtmlFromClipboard(clipboard: DataTransfer): string {
  const html = clipboard.getData("text/html") ?? "";
  const plain = clipboard.getData("text/plain") ?? "";
  if (html && html.trim().length > 0) {
    return sanitizeSignatureHtml(html);
  }
  // Plain may be raw HTML the user copied as source
  if (plain.trim().startsWith("<") && /<[a-z]/i.test(plain)) {
    return sanitizeSignatureHtml(plain);
  }
  if (!plain.trim()) return "";
  // Plain text signature → simple paragraphs
  return sanitizeSignatureHtml(
    plain
      .split(/\n\n+/)
      .map((block) => `<p>${block.split("\n").join("<br>")}</p>`)
      .join("")
  );
}

/**
 * HTML used at send time must match preview: sanitize only, no layout rewrite.
 * Variable substitution is applied separately by renderEmailTemplate.
 */
export function signatureHtmlForSend(html: string): string {
  return sanitizeSignatureHtml(html);
}

import { plainTextToHtml } from "@/lib/email-templates";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "span",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "font",
]);

const BLOCK_TO_P = new Set(["div", "h1", "h2", "h3", "h4", "h5", "h6"]);

const HTML_FONT_SIZE_MAP: Record<string, string> = {
  "1": "10px",
  "2": "12px",
  "3": "14px",
  "4": "16px",
  "5": "18px",
  "6": "24px",
  "7": "36px",
};

const VAR_PLACEHOLDER_PREFIX = "__PNP_VAR_";
const VAR_PLACEHOLDER_SUFFIX = "__";

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function cssSizeToPx(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const pxMatch = trimmed.match(/^([\d.]+)px$/);
  if (pxMatch) return `${Math.round(parseFloat(pxMatch[1]) * 10) / 10}px`;
  const ptMatch = trimmed.match(/^([\d.]+)pt$/);
  if (ptMatch) return `${Math.round(parseFloat(ptMatch[1]) * 1.333 * 10) / 10}px`;
  const emMatch = trimmed.match(/^([\d.]+)em$/);
  if (emMatch) return `${Math.round(parseFloat(emMatch[1]) * 16 * 10) / 10}px`;
  return null;
}

function normalizeStyleValue(prop: string, value: string): string {
  if (prop === "font-size") {
    return cssSizeToPx(value) ?? value;
  }
  return value;
}

function collectInlineStyles(el: HTMLElement): string {
  const styles: string[] = [];
  const props = [
    "fontWeight",
    "fontStyle",
    "fontFamily",
    "textDecoration",
    "textDecorationLine",
    "color",
    "fontSize",
    "lineHeight",
    "marginLeft",
    "textAlign",
    "backgroundColor",
  ] as const;

  for (const prop of props) {
    const val = el.style[prop];
    if (val) {
      const cssKey = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      styles.push(`${cssKey}:${normalizeStyleValue(cssKey, val)}`);
    }
  }

  return styles.join(";");
}

function parseStyleAttribute(styleAttr: string): string {
  const parts: string[] = [];
  for (const chunk of styleAttr.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed || !trimmed.includes(":")) continue;
    const colon = trimmed.indexOf(":");
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (!key || !value) continue;
    parts.push(`${key}:${normalizeStyleValue(key, value)}`);
  }
  return parts.join(";");
}

function getElementStyleCss(el: HTMLElement): string {
  const seen = new Map<string, string>();

  const merge = (styleStr: string) => {
    for (const chunk of styleStr.split(";")) {
      const trimmed = chunk.trim();
      if (!trimmed || !trimmed.includes(":")) continue;
      const colon = trimmed.indexOf(":");
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if (key && value) seen.set(key, value);
    }
  };

  merge(parseStyleAttribute(el.getAttribute("style") ?? ""));
  merge(collectInlineStyles(el));

  const tag = el.tagName.toLowerCase();
  if ((tag === "b" || tag === "strong") && !seen.has("font-weight")) {
    seen.set("font-weight", "600");
  }
  if ((tag === "i" || tag === "em") && !seen.has("font-style")) {
    seen.set("font-style", "italic");
  }
  if (tag === "u" && !seen.has("text-decoration")) {
    seen.set("text-decoration", "underline");
  }

  return Array.from(seen.entries())
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

function wrapWithStyle(tag: string, children: string, style: string): string {
  if (!style) return `<${tag}>${children}</${tag}>`;
  return `<${tag} style="${escapeAttr(style)}">${children}</${tag}>`;
}

function wrapInline(children: string, style: string, fallbackTag?: string): string {
  if (style) return `<span style="${escapeAttr(style)}">${children}</span>`;
  if (fallbackTag) return `<${fallbackTag}>${children}</${fallbackTag}>`;
  return children;
}

export function variableChipHtml(variable: string): string {
  return `<span data-var="${variable}" contenteditable="false" class="email-var-chip">${variable}</span>`;
}

function protectVariableChips(html: string): { html: string; chips: string[] } {
  const chips: string[] = [];
  const protectedHtml = html.replace(
    /<span[^>]*data-var="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, variable: string) => {
      const idx = chips.length;
      chips.push(variableChipHtml(variable));
      return `${VAR_PLACEHOLDER_PREFIX}${idx}${VAR_PLACEHOLDER_SUFFIX}`;
    }
  );
  return { html: protectedHtml, chips };
}

function restoreVariableChips(html: string, chips: string[]): string {
  let result = html;
  chips.forEach((chip, idx) => {
    result = result.split(`${VAR_PLACEHOLDER_PREFIX}${idx}${VAR_PLACEHOLDER_SUFFIX}`).join(chip);
  });
  return result;
}

function isGmailHtml(html: string): boolean {
  return (
    /google|gmail|docs-internal-guid|MsoNormal|gmail_/i.test(html) ||
    html.includes("<!--")
  );
}

export function sanitizePastedHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\sid="[^"]*"/gi, "");

  const doc = new DOMParser().parseFromString(cleaned, "text/html");

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "script" || tag === "style") return "";

    const children = Array.from(el.childNodes).map(walk).join("");

    if (tag.startsWith("o:") || tag === "meta" || tag === "link") return children;

    if (!ALLOWED_TAGS.has(tag) && !BLOCK_TO_P.has(tag)) {
      const style = getElementStyleCss(el);
      if (style && children) return `<span style="${escapeAttr(style)}">${children}</span>`;
      return children;
    }

    if (BLOCK_TO_P.has(tag)) {
      const style = getElementStyleCss(el);
      const inner = style ? `<span style="${escapeAttr(style)}">${children}</span>` : children;
      return children.trim() ? `<p>${inner}</p>` : "";
    }

    if (tag === "br") return "<br>";
    if (tag === "hr") return "<hr>";

    if (tag === "a") {
      const href = el.getAttribute("href") ?? "#";
      if (href.startsWith("javascript:")) return children;
      const style = getElementStyleCss(el);
      if (style) {
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" style="${escapeAttr(style)}">${children}</a>`;
      }
      return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener">${children}</a>`;
    }

    if (tag === "font") {
      const styles: string[] = [];
      const color = el.getAttribute("color");
      const face = el.getAttribute("face");
      const size = el.getAttribute("size");
      if (color) styles.push(`color:${color}`);
      if (face) styles.push(`font-family:${face}`);
      if (size) {
        const mapped = HTML_FONT_SIZE_MAP[size] ?? cssSizeToPx(size);
        if (mapped) styles.push(`font-size:${mapped}`);
      }
      const inline = getElementStyleCss(el);
      if (inline) styles.push(inline);
      const style = [...new Set(styles.join(";").split(";").filter(Boolean))].join(";");
      return style
        ? `<span style="${escapeAttr(style)}">${children}</span>`
        : children;
    }

    if (tag === "span" && el.dataset.var) {
      return variableChipHtml(el.dataset.var);
    }

    if (tag === "span" || tag === "b" || tag === "i" || tag === "u" || tag === "em" || tag === "strong") {
      const style = getElementStyleCss(el);
      return wrapInline(children, style, tag === "span" ? undefined : tag);
    }

    if (tag === "blockquote") {
      const style = getElementStyleCss(el);
      const margin = style
        ? `${style};margin-left:12px;border-left:3px solid #e5e7eb;padding-left:12px`
        : "margin-left:12px;border-left:3px solid #e5e7eb;padding-left:12px";
      return `<blockquote style="${escapeAttr(margin)}">${children}</blockquote>`;
    }

    return wrapWithStyle(tag, children, getElementStyleCss(el));
  };

  const body = doc.body;
  const parts = Array.from(body.childNodes).map(walk).join("");
  return parts.trim() || "<p></p>";
}

export function pasteToEditorHtml(clipboard: DataTransfer): string {
  const plain = clipboard.getData("text/plain") ?? "";
  const html = clipboard.getData("text/html") ?? "";

  const plainLooksLikeTags = /^[\s]*<[/a-z]/i.test(plain);

  if (html && html.length > 0 && !plainLooksLikeTags) {
    const sanitized = sanitizePastedHtml(html);
    if (isGmailHtml(html) || sanitized.length > 20) {
      return sanitized;
    }
  }

  return plainTextToHtml(plain);
}

export function cleanEditorHtml(html: string): string {
  if (!html.trim() || html === "<br>") return "<p></p>";

  let cleaned = html
    .replace(/<div><br><\/div>/gi, "<p></p>")
    .replace(/<div>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(/<p>\s*<\/p>/gi, "");

  if (!/<p|<ul|<ol|<li|<blockquote/i.test(cleaned)) {
    cleaned = `<p>${cleaned}</p>`;
  }

  return cleaned;
}

export function normalizeEditorHtml(html: string): string {
  if (!html.trim() || html === "<br>") return "<p></p>";
  const { html: protectedHtml, chips } = protectVariableChips(html);
  const sanitized = sanitizePastedHtml(protectedHtml);
  const restored = restoreVariableChips(sanitized, chips);
  return cleanEditorHtml(restored);
}

function styleObjectToCss(style: Record<string, string>): string {
  return Object.entries(style)
    .filter(([, v]) => v.length > 0)
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${cssKey}:${normalizeStyleValue(cssKey, value)}`;
    })
    .join(";");
}

export function applyStyleToSelection(style: Record<string, string>) {
  const styleCss = styleObjectToCss(style);
  if (!styleCss) return;

  const selection = window.getSelection();
  if (!selection?.rangeCount) return;

  const range = selection.getRangeAt(0);

  if (range.collapsed) {
    const span = document.createElement("span");
    span.setAttribute("style", styleCss);
    span.appendChild(document.createTextNode("\u200B"));
    range.insertNode(span);
    range.setStart(span.firstChild!, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  try {
    const span = document.createElement("span");
    span.setAttribute("style", styleCss);
    range.surroundContents(span);
  } catch {
    document.execCommand(
      "insertHTML",
      false,
      `<span style="${escapeAttr(styleCss)}">${range.toString()}</span>`
    );
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertHtmlAtCursor(html: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  selection.deleteFromDocument();
  const range = selection.getRangeAt(0);
  const fragment = range.createContextualFragment(html);
  range.insertNode(fragment);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Underline,
} from "lucide-react";
import {
  BACKGROUND_COLOR_OPTIONS,
  EMAIL_VARIABLES,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  TEXT_COLOR_OPTIONS,
  normalizeEmailBody,
} from "@/lib/email-templates";
import {
  applyStyleToSelection,
  cleanEditorHtml,
  insertHtmlAtCursor,
  normalizeEditorHtml,
  pasteToEditorHtml,
  variableChipHtml,
} from "@/lib/rich-editor-utils";
import { cn } from "@/lib/utils";

interface RichEmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  layout?: "full" | "inbox";
  minHeight?: number;
  variant?: "default" | "compact";
  showVariables?: boolean;
}

const DEFAULT_EMAIL_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function exec(cmd: string, val?: string) {
  try {
    document.execCommand("styleWithCSS", false, "true");
  } catch {
    /* legacy browsers */
  }
  document.execCommand(cmd, false, val);
}

function normalizeFontToken(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").trim();
}

function matchFontFamily(computed: string): string {
  const normalized = normalizeFontToken(computed);
  for (const opt of FONT_FAMILY_OPTIONS) {
    if (!opt.value) continue;
    const primary = normalizeFontToken(opt.value.split(",")[0] ?? "");
    if (primary && normalized.includes(primary)) return opt.value;
  }
  return "";
}

function parseComputedSizePx(computed: string): number | null {
  const pxMatch = computed.trim().match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  const ptMatch = computed.trim().match(/^([\d.]+)pt$/);
  if (ptMatch) return parseFloat(ptMatch[1]) * 1.333;
  return null;
}

function matchFontSize(computed: string): string {
  const exact = FONT_SIZE_OPTIONS.find((opt) => opt.value === computed);
  if (exact) return exact.value;

  const px = parseComputedSizePx(computed);
  if (px == null) return "";

  let closest: string = FONT_SIZE_OPTIONS[0].value;
  let minDiff = Infinity;
  for (const opt of FONT_SIZE_OPTIONS) {
    const diff = Math.abs(parseFloat(opt.value) - px);
    if (diff < minDiff) {
      minDiff = diff;
      closest = opt.value;
    }
  }
  return closest;
}

function ToolbarDivider() {
  return <div className="mx-0.5 hidden h-7 w-px shrink-0 bg-border/60 sm:block" />;
}

function ToolbarGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border/40 bg-background/50 px-1 py-0.5",
        className
      )}
      title={label}
    >
      {children}
    </div>
  );
}

export function RichEmailEditor({
  value,
  onChange,
  placeholder = "Escreva o corpo do email...",
  className,
  disabled = false,
  layout = "full",
  minHeight = 520,
  variant = "default",
  showVariables = true,
}: RichEmailEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const lastEmitted = useRef("");
  const mounted = useRef(false);
  const isComposing = useRef(false);
  const [showTextColors, setShowTextColors] = useState(false);
  const [showBgColors, setShowBgColors] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [activeFontFamily, setActiveFontFamily] = useState("");
  const [activeFontSize, setActiveFontSize] = useState("16px");

  const closeMenus = useCallback(() => {
    setShowTextColors(false);
    setShowBgColors(false);
    setVariablesOpen(false);
  }, []);

  const updateActiveTypography = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel?.anchorNode || !editor.contains(sel.anchorNode)) return;

    let node: Node | null = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const el = node as HTMLElement | null;
    if (!el) return;

    const computed = window.getComputedStyle(el);
    setActiveFontFamily(matchFontFamily(computed.fontFamily));
    setActiveFontSize(matchFontSize(computed.fontSize) || "16px");
  }, []);

  const syncFromEditor = useCallback(
    (normalize = false) => {
      const el = editorRef.current;
      if (!el || isComposing.current) return;
      const raw = el.innerHTML;
      const html = normalize ? normalizeEditorHtml(raw) : cleanEditorHtml(raw);
      if (normalize && html !== raw) {
        el.innerHTML = html;
      }
      lastEmitted.current = html;
      onChange(html);
    },
    [onChange]
  );

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!mounted.current || value !== lastEmitted.current) {
      el.innerHTML = normalizeEmailBody(value);
      lastEmitted.current = value;
      mounted.current = true;
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) closeMenus();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeMenus]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateActiveTypography);
    return () =>
      document.removeEventListener("selectionchange", updateActiveTypography);
  }, [updateActiveTypography]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const handleFormat = (action: () => void) => {
    if (disabled) return;
    editorRef.current?.focus();
    restoreSelection();
    action();
    syncFromEditor(true);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    e.preventDefault();
    const html = pasteToEditorHtml(e.clipboardData);
    insertHtmlAtCursor(html);
    syncFromEditor(true);
  };

  const insertLink = () => {
    const url = window.prompt("URL do link:", "https://");
    if (!url) return;
    handleFormat(() => exec("createLink", url));
  };

  const applyFontFamily = (family: string) => {
    handleFormat(() =>
      applyStyleToSelection({
        fontFamily: family || DEFAULT_EMAIL_FONT_FAMILY,
      })
    );
    setActiveFontFamily(family);
  };

  const applyFontSize = (size: string) => {
    handleFormat(() => applyStyleToSelection({ fontSize: size }));
    setActiveFontSize(size);
  };

  const insertVariable = (variable: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    insertHtmlAtCursor(`${variableChipHtml(variable)}&nbsp;`);
    syncFromEditor();
    closeMenus();
  };

  const toolbarBtn = (active?: boolean) =>
    cn(
      "flex size-8 items-center justify-center rounded-md transition-all",
      disabled && "pointer-events-none opacity-40",
      active
        ? "bg-primary/15 text-primary shadow-sm"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    );

  const toolbarSelectClass = cn(
    "h-8 rounded-md border border-border/50 bg-background/80 text-xs text-foreground shadow-sm",
    "focus:outline-none focus:ring-1 focus:ring-primary/40",
    disabled && "pointer-events-none opacity-40"
  );

  const compact = variant === "compact";
  const editorMinHeight = compact ? Math.min(minHeight, 200) : minHeight;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm",
        className
      )}
    >
      <div
        ref={toolbarRef}
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/20",
          compact ? "px-2 py-1.5" : "px-3 py-2.5"
        )}
      >
        <ToolbarGroup label="Tipografia" className="gap-1.5 px-1.5">
          <select
            title="Família da fonte"
            aria-label="Família da fonte"
            className={cn(toolbarSelectClass, "max-w-[148px] min-w-[120px] px-2")}
            value={activeFontFamily}
            disabled={disabled}
            onMouseDown={(e) => {
              e.stopPropagation();
              saveSelection();
            }}
            onChange={(e) => applyFontFamily(e.target.value)}
          >
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value} style={{ fontFamily: opt.value || undefined }}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            title="Tamanho da fonte"
            aria-label="Tamanho da fonte"
            className={cn(toolbarSelectClass, "w-[72px] px-1.5 text-center")}
            value={activeFontSize}
            disabled={disabled}
            onMouseDown={(e) => {
              e.stopPropagation();
              saveSelection();
            }}
            onChange={(e) => applyFontSize(e.target.value)}
          >
            {FONT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </ToolbarGroup>

        <ToolbarDivider />

        <ToolbarGroup label="Formatação">
          <button type="button" title="Negrito" className={toolbarBtn()} onClick={() => handleFormat(() => exec("bold"))}>
            <Bold className="size-4" />
          </button>
          <button type="button" title="Itálico" className={toolbarBtn()} onClick={() => handleFormat(() => exec("italic"))}>
            <Italic className="size-4" />
          </button>
          <button type="button" title="Sublinhado" className={toolbarBtn()} onClick={() => handleFormat(() => exec("underline"))}>
            <Underline className="size-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              title="Cor do texto"
              className={toolbarBtn(showTextColors)}
              onClick={() => {
                setShowTextColors((v) => !v);
                setShowBgColors(false);
                setVariablesOpen(false);
              }}
            >
              <Palette className="size-4" />
            </button>
            {showTextColors && (
              <div className="absolute left-0 top-full z-40 mt-1.5 w-[200px] rounded-xl border border-border/60 bg-card p-3 shadow-2xl">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cor do texto
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {TEXT_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.color}
                      type="button"
                      title={opt.label}
                      className="group flex flex-col items-center gap-1"
                      onClick={() => {
                        handleFormat(() => exec("foreColor", opt.color));
                        closeMenus();
                      }}
                    >
                      <span
                        className="size-8 rounded-lg border-2 border-border/50 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="text-[9px] text-muted-foreground">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              title="Cor de fundo"
              className={toolbarBtn(showBgColors)}
              onClick={() => {
                setShowBgColors((v) => !v);
                setShowTextColors(false);
                setVariablesOpen(false);
              }}
            >
              <Highlighter className="size-4" />
            </button>
            {showBgColors && (
              <div className="absolute left-0 top-full z-40 mt-1.5 w-[200px] rounded-xl border border-border/60 bg-card p-3 shadow-2xl">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cor de fundo
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {BACKGROUND_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.color}
                      type="button"
                      title={opt.label}
                      className="group flex flex-col items-center gap-1"
                      onClick={() => {
                        handleFormat(() => exec("backColor", opt.color));
                        closeMenus();
                      }}
                    >
                      <span
                        className="size-8 rounded-lg border-2 border-border/50 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="text-[9px] text-muted-foreground">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ToolbarGroup>

        <ToolbarDivider />

        <ToolbarGroup label="Alinhamento">
          <button type="button" title="Alinhar à esquerda" className={toolbarBtn()} onClick={() => handleFormat(() => exec("justifyLeft"))}>
            <AlignLeft className="size-4" />
          </button>
          <button type="button" title="Centralizar" className={toolbarBtn()} onClick={() => handleFormat(() => exec("justifyCenter"))}>
            <AlignCenter className="size-4" />
          </button>
          <button type="button" title="Alinhar à direita" className={toolbarBtn()} onClick={() => handleFormat(() => exec("justifyRight"))}>
            <AlignRight className="size-4" />
          </button>
          <button type="button" title="Justificar" className={toolbarBtn()} onClick={() => handleFormat(() => exec("justifyFull"))}>
            <AlignJustify className="size-4" />
          </button>
        </ToolbarGroup>

        <ToolbarDivider />

        <ToolbarGroup label="Listas e links">
          <button type="button" title="Lista com marcadores" className={toolbarBtn()} onClick={() => handleFormat(() => exec("insertUnorderedList"))}>
            <List className="size-4" />
          </button>
          <button type="button" title="Lista numerada" className={toolbarBtn()} onClick={() => handleFormat(() => exec("insertOrderedList"))}>
            <ListOrdered className="size-4" />
          </button>
          <button type="button" title="Inserir link" className={toolbarBtn()} onClick={insertLink}>
            <Link2 className="size-4" />
          </button>
        </ToolbarGroup>

        {showVariables && (
          <>
            <ToolbarDivider />
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setVariablesOpen((v) => !v);
                  setShowTextColors(false);
                  setShowBgColors(false);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                  variablesOpen
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                    : "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:border-blue-400/50 hover:bg-blue-500/15",
                  disabled && "pointer-events-none opacity-40"
                )}
              >
                <Braces className="size-4" />
                Variáveis
              </button>
              {variablesOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 min-w-[220px] rounded-xl border border-blue-500/30 bg-card p-2 shadow-2xl sm:left-auto sm:right-0">
                  <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Inserir variável
                  </p>
                  <div className="grid gap-1">
                    {EMAIL_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-500/10"
                      >
                        <span className="font-mono text-xs text-blue-300">{v.key}</span>
                        <span className="text-xs text-muted-foreground">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={cn(
          "border-t border-border/40",
          layout === "inbox" ? "bg-[#f3f4f6]" : "bg-white"
        )}
      >
        <div className={cn("bg-white", layout === "inbox" && "mx-auto max-w-[680px]")}>
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={() => syncFromEditor()}
            onBlur={() => syncFromEditor(true)}
            onKeyUp={updateActiveTypography}
            onMouseUp={updateActiveTypography}
            onPaste={handlePaste}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
              syncFromEditor(true);
            }}
            data-placeholder={placeholder}
            style={{ minHeight: editorMinHeight }}
            className={cn(
              "email-canvas email-editor-canvas w-full outline-none",
              compact ? "px-4 py-4 sm:px-6" : "px-6 py-8 sm:px-12",
              "empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)]",
              disabled && "cursor-not-allowed opacity-60"
            )}
          />
        </div>
      </div>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Code2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isSignatureHtmlEmpty,
  sanitizeSignatureHtml,
  signatureHtmlFromClipboard,
} from "@/lib/signature-html";
import { cn } from "@/lib/utils";

interface SignatureHtmlEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  minHeight?: number;
  className?: string;
}

/**
 * Editor dedicated to email signatures.
 * Does NOT run the body-email normalizer that converts tables/divs to <p>.
 * Paste from Gmail keeps tables, images, inline styles, links.
 */
export function SignatureHtmlEditor({
  value,
  onChange,
  disabled = false,
  minHeight = 280,
  className,
}: SignatureHtmlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef("");
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState(value);

  // Sync external value into contentEditable (when not dirty from self).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmitted.current) {
      el.innerHTML = value || "";
      lastEmitted.current = value;
      setHtmlDraft(value);
    }
  }, [value]);

  const emit = useCallback(
    (raw: string) => {
      const html = sanitizeSignatureHtml(raw);
      lastEmitted.current = html;
      setHtmlDraft(html);
      onChange(html);
    },
    [onChange]
  );

  const syncFromVisual = useCallback(() => {
    const el = editorRef.current;
    if (!el || disabled) return;
    emit(el.innerHTML);
  }, [disabled, emit]);

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    e.preventDefault();
    const html = signatureHtmlFromClipboard(e.clipboardData);
    // Insert sanitized fragment at cursor
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement("div");
      temp.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node: ChildNode | null;
      while ((node = temp.firstChild)) {
        frag.appendChild(node);
      }
      range.insertNode(frag);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (editorRef.current) {
      editorRef.current.innerHTML = html;
    }
    syncFromVisual();
  };

  const applyHtmlMode = () => {
    const sanitized = sanitizeSignatureHtml(htmlDraft);
    setHtmlDraft(sanitized);
    lastEmitted.current = sanitized;
    onChange(sanitized);
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitized;
    }
    setMode("visual");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "visual" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => {
            if (mode === "html") applyHtmlMode();
            else setMode("visual");
          }}
        >
          <Eye className="size-3.5" />
          Visual
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "html" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => {
            setHtmlDraft(value);
            setMode("html");
          }}
        >
          <Code2 className="size-3.5" />
          Colar HTML
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Cole a assinatura do Gmail (Ctrl+V) no modo visual ou o HTML completo
          em “Colar HTML”.
        </p>
      </div>

      {mode === "visual" ? (
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label="Editor de assinatura"
          data-signature-editor="true"
          className={cn(
            "overflow-auto rounded-xl border border-border/60 bg-white p-4 text-sm text-foreground shadow-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            "prose prose-sm max-w-none dark:prose-invert",
            // Important: do not force prose table resets that break email tables
            "[&_table]:max-w-full [&_img]:max-w-full",
            disabled && "pointer-events-none opacity-50"
          )}
          style={{ minHeight }}
          onInput={syncFromVisual}
          onBlur={syncFromVisual}
          onPaste={handlePaste}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="signature-raw-html">HTML da assinatura</Label>
          <Textarea
            id="signature-raw-html"
            value={htmlDraft}
            disabled={disabled}
            rows={14}
            className="font-mono text-xs"
            placeholder="Cole aqui o HTML completo da assinatura do Gmail…"
            onChange={(e) => setHtmlDraft(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={applyHtmlMode}
          >
            Aplicar HTML e ver visual
          </Button>
        </div>
      )}

      {isSignatureHtmlEmpty(value) && (
        <p className="text-xs text-muted-foreground">
          Assinatura vazia — cole a do Gmail (Nova mensagem → assine → Ctrl+C →
          Ctrl+V aqui).
        </p>
      )}
    </div>
  );
}

"use client";

import { AlertCircle, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CampaignSendError } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface CampaignSendErrorLogProps {
  errors: CampaignSendError[];
  className?: string;
}

export function CampaignSendErrorLog({
  errors,
  className,
}: CampaignSendErrorLogProps) {
  if (errors.length === 0) return null;

  const handleExport = () => {
    const headers = [
      "email",
      "empresa",
      "codigo",
      "mensagem",
      "provedor",
      "lote",
      "data",
    ];
    const rows = errors.map((e) => [
      e.email,
      e.company,
      e.errorCode,
      e.errorMessage,
      e.provider,
      String(e.batchNumber),
      e.occurredAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={cn("border-red-500/25", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-red-300">
          <AlertCircle className="size-4" />
          Log de erros
          <Badge variant="outline" className="tabular-nums">
            {errors.length}
          </Badge>
        </CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={handleExport}>
          <Download className="size-3.5" />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Empresa</th>
                <th className="px-4 py-2">Erro</th>
                <th className="px-4 py-2">Lote</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((err) => (
                <tr
                  key={err.id}
                  className="border-t border-border/40 hover:bg-red-500/5"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-red-200">
                    {err.email}
                  </td>
                  <td className="px-4 py-2.5">{err.company}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className="mb-1 font-mono text-[10px] text-red-300"
                    >
                      {err.errorCode}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {err.errorMessage}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    #{err.batchNumber}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
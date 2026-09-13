"use client";

import { useEffect } from "react";
import { Mail, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAutonomousDailySentCount,
  useSettingsStore,
} from "@/store/settings-store";

export function SmtpAutonomousSettings() {
  const dailySentDate = useSettingsStore((s) => s.autonomousDailySentDate);
  const dailySentCount = useSettingsStore((s) => s.autonomousDailySentCount);
  const resetAutonomousDailyCountIfNeeded = useSettingsStore(
    (s) => s.resetAutonomousDailyCountIfNeeded
  );

  useEffect(() => {
    resetAutonomousDailyCountIfNeeded();
  }, [resetAutonomousDailyCountIfNeeded]);

  const dailyCount = computeAutonomousDailySentCount(
    dailySentDate,
    dailySentCount
  );

  return (
    <Card className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4 text-emerald-400" />
          Modo Autônomo Free — SMTP
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Credenciais SMTP ficam somente no servidor (.env.local). O browser não
          armazena nem envia senhas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-200">
            <Shield className="size-3.5" />
            Envio real pelo Agente 3
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Configure <code>PNP_SMTP_*</code> e <code>MODECLEAN_SMTP_*</code> no
              ambiente do host
            </li>
            <li>
              Ative <code>AGENT3_REAL_SEND_ENABLED=true</code> para envio real
            </li>
            <li>Enviados hoje via modo autônomo: <strong>{dailyCount}</strong></li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

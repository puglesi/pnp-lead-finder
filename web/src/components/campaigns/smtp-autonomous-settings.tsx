"use client";

import { useEffect } from "react";
import { Mail, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeAutonomousDailySentCount,
  useSettingsStore,
} from "@/store/settings-store";

export function SmtpAutonomousSettings() {
  const smtpEmail = useSettingsStore((s) => s.smtpEmail);
  const smtpPassword = useSettingsStore((s) => s.smtpPassword);
  const setSmtpConfig = useSettingsStore((s) => s.setSmtpConfig);
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
          Use seu Gmail ou Outlook com senha de app. Sem custo de API — ideal para
          volume pequeno-médio.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-email">Seu email</Label>
            <Input
              id="smtp-email"
              type="email"
              placeholder="voce@gmail.com"
              value={smtpEmail}
              onChange={(e) => setSmtpConfig(e.target.value, smtpPassword)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-pass">Senha de app</Label>
            <Input
              id="smtp-pass"
              type="password"
              placeholder="xxxx xxxx xxxx xxxx"
              value={smtpPassword}
              onChange={(e) => setSmtpConfig(smtpEmail, e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-200">
            <Shield className="size-3.5" />
            Dicas anti-bloqueio
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Gmail: ative verificação em 2 etapas e crie uma senha de app</li>
            <li>Outlook: use senha de app em Configurações → Segurança</li>
            <li>Mantenha delays altos e limite diário (ex: 50–100/dia)</li>
            <li>Enviados hoje via modo autônomo: <strong>{dailyCount}</strong></li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

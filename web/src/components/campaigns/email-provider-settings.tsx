"use client";

import { KeyRound, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmailProviderSettings() {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-amber-400" />
          Credenciais — somente servidor
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          API keys e senhas SMTP não são pedidas nem guardadas no browser.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Shield className="size-4" />
            Use o Agente 3
          </p>
          <p className="mt-2">
            O envio real resolve credenciais exclusivamente no servidor via
            variáveis de ambiente. O caminho <code>/api/email/send</code> não
            aceita password do cliente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

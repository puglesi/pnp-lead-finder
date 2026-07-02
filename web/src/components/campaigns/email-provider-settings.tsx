"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { KeyRound, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  selectEmailProviderCredentials,
  useSettingsStore,
} from "@/store/settings-store";
import { EMAIL_PROVIDER_CATALOG, listEmailProviders } from "@/lib/email-providers";

export function EmailProviderSettings() {
  const credentials = useSettingsStore(
    useShallow(selectEmailProviderCredentials)
  );
  const providers = useMemo(
    () => listEmailProviders(credentials, "paid"),
    [credentials]
  );
  const resendApiKey = useSettingsStore((s) => s.resendApiKey);
  const setResendApiKey = useSettingsStore((s) => s.setResendApiKey);
  const mailgunApiKey = useSettingsStore((s) => s.mailgunApiKey);
  const mailgunDomain = useSettingsStore((s) => s.mailgunDomain);
  const setMailgunConfig = useSettingsStore((s) => s.setMailgunConfig);
  const sesAccessKey = useSettingsStore((s) => s.sesAccessKey);
  const sesSecretKey = useSettingsStore((s) => s.sesSecretKey);
  const sesRegion = useSettingsStore((s) => s.sesRegion);
  const setSesConfig = useSettingsStore((s) => s.setSesConfig);
  const sendgridApiKey = useSettingsStore((s) => s.sendgridApiKey);
  const setSendgridApiKey = useSettingsStore((s) => s.setSendgridApiKey);
  const brevoApiKey = useSettingsStore((s) => s.brevoApiKey);
  const setBrevoApiKey = useSettingsStore((s) => s.setBrevoApiKey);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-amber-400" />
          Credenciais — Serviços Pagos (API)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Mailgun, Resend, Amazon SES, Brevo e SendGrid para envio em massa com alta
          entrega
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span
              key={p.id}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                p.configured
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-border/60 text-muted-foreground"
              }`}
            >
              {p.name}
              {p.configured ? " ✓" : ""}
            </span>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Resend
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="resend-key">API Key</Label>
            <Input
              id="resend-key"
              type="password"
              placeholder="re_..."
              value={resendApiKey}
              onChange={(e) => setResendApiKey(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mailgun
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mg-key">API Key</Label>
              <Input
                id="mg-key"
                type="password"
                value={mailgunApiKey}
                onChange={(e) =>
                  setMailgunConfig(e.target.value, mailgunDomain)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-domain">Domínio</Label>
              <Input
                id="mg-domain"
                placeholder="mg.seudominio.com"
                value={mailgunDomain}
                onChange={(e) =>
                  setMailgunConfig(mailgunApiKey, e.target.value)
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Brevo
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="brevo-key">API Key</Label>
            <Input
              id="brevo-key"
              type="password"
              placeholder="xkeysib-..."
              value={brevoApiKey}
              onChange={(e) => setBrevoApiKey(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Amazon SES
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="ses-region">Região</Label>
              <Input
                id="ses-region"
                value={sesRegion}
                onChange={(e) =>
                  setSesConfig(sesAccessKey, sesSecretKey, e.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ses-access">Access Key</Label>
              <Input
                id="ses-access"
                type="password"
                value={sesAccessKey}
                onChange={(e) =>
                  setSesConfig(e.target.value, sesSecretKey, sesRegion)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ses-secret">Secret Key</Label>
              <Input
                id="ses-secret"
                type="password"
                value={sesSecretKey}
                onChange={(e) =>
                  setSesConfig(sesAccessKey, e.target.value, sesRegion)
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SendGrid
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="sg-key">API Key</Label>
            <Input
              id="sg-key"
              type="password"
              value={sendgridApiKey}
              onChange={(e) => setSendgridApiKey(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {EMAIL_PROVIDER_CATALOG.filter(
            (p) => p.docsUrl && p.sendMode === "paid"
          ).map((p) => (
            <a
              key={p.id}
              href={p.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              <ExternalLink className="size-3" />
              {p.name} docs
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
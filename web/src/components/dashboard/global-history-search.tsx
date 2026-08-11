"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Building2,
  History,
  Mail,
  Megaphone,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { searchGlobalHistory } from "@/lib/global-history-search";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { EMAIL_BLOCK_REASON_LABELS } from "@/lib/email-blocklist";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  search: History,
  lead: Users,
  campaign: Megaphone,
  blocked: Ban,
  sent: Send,
} as const;

function formatMeta(value?: string) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

export function GlobalHistorySearch() {
  const [query, setQuery] = useState("");
  const fullSearchHistory = useLeadStore((s) => s.fullSearchHistory);
  const recentSearches = useLeadStore((s) => s.recentSearches);
  const savedLeads = useLeadStore((s) => s.savedLeads);
  const importedLeads = useLeadStore((s) => s.importedLeads);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const blockedEmails = useEmailBlocklistStore((s) => s.entries);

  const hits = useMemo(
    () =>
      searchGlobalHistory({
        query,
        fullSearchHistory,
        recentSearches,
        savedLeads,
        importedLeads,
        campaigns,
        blockedEmails,
        limit: 30,
      }),
    [
      query,
      fullSearchHistory,
      recentSearches,
      savedLeads,
      importedLeads,
      campaigns,
      blockedEmails,
    ]
  );

  return (
    <CollapsibleCard
      storageKey="dashboard-global-history-search"
      defaultOpen
      className="border-border/60 bg-card/80"
    >
      <CollapsibleCardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="size-5 text-primary" />
          Consultar histórico
        </CardTitle>
        <CardDescription>
          Pesquisa informativa em e-mails, empresas, domínios, setores,
          localizações e campanhas. Não inicia busca nova.
        </CardDescription>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: accountants, info@empresa.com, London…"
            className="pl-9"
            aria-label="Consultar histórico"
          />
        </div>

        {query.trim() && hits.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum registro encontrado para “{query.trim()}”.
          </p>
        )}

        {hits.length > 0 && (
          <ul className="space-y-2">
            {hits.map((hit) => {
              const Icon = KIND_ICON[hit.kind] ?? Building2;
              return (
                <li
                  key={hit.id}
                  className={cn(
                    "rounded-xl border border-border/60 bg-background/40 p-3",
                    hit.kind === "blocked" &&
                      "border-red-500/35 bg-red-500/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        hit.kind === "blocked"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {hit.kind === "lead" || hit.kind === "sent" ? (
                        hit.kind === "sent" ? (
                          <Send className="size-4" />
                        ) : (
                          <Mail className="size-4" />
                        )
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{hit.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {hit.subtitle}
                      </p>
                      {hit.meta && (
                        <p className="mt-0.5 text-xs text-muted-foreground/80">
                          {formatMeta(hit.meta)}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {hit.badges.map((badge) => {
                          const reasonLabel =
                            EMAIL_BLOCK_REASON_LABELS[
                              badge as keyof typeof EMAIL_BLOCK_REASON_LABELS
                            ];
                          const label = reasonLabel ?? badge;
                          const isBlocked =
                            badge.toLowerCase().includes("bloqueado") ||
                            hit.kind === "blocked";
                          return (
                            <Badge
                              key={badge}
                              variant={isBlocked ? "danger" : "secondary"}
                              className="text-[10px]"
                            >
                              {label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}

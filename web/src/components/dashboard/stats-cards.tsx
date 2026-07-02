"use client";

import { Building2, Mail, Megaphone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { cn } from "@/lib/utils";

export function StatsCards() {
  const { savedLeads, recentSearches } = useLeadStore();
  const { getStats } = useCampaignStore();
  const campaignStats = getStats();

  const emailsValid = savedLeads.filter((l) => l.email).length;
  const totalFound = recentSearches.reduce((s, r) => s + r.resultsCount, 0);

  const stats = [
    {
      label: "Empresas Encontradas",
      value: totalFound.toLocaleString("pt-BR"),
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Leads Salvos",
      value: savedLeads.length.toLocaleString("pt-BR"),
      icon: Users,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Emails Válidos",
      value: emailsValid.toLocaleString("pt-BR"),
      icon: Mail,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Campanhas Ativas",
      value: campaignStats.active.toLocaleString("pt-BR"),
      icon: Megaphone,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            className="border-border/60 bg-card/80 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl",
                  stat.bg
                )}
              >
                <Icon className={cn("size-6", stat.color)} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
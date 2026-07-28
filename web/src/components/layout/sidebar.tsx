"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Users,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  History,
  Pickaxe,
  ShieldCheck,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/busca", label: "Nova Busca", icon: Search },
  { href: "/agente-1", label: "Agente 1 — Garimpeiro", icon: Pickaxe },
  { href: "/agente-2", label: "Agente 2 — Validador", icon: ShieldCheck },
  { href: "/agente-3", label: "Agente 3 — Enviador", icon: Send },
  { href: "/historico", label: "Histórico de Buscas", icon: History },
  { href: "/leads", label: "Meus Leads", icon: Users },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, savedLeads } = useLeadStore();
  const campaignCount = useCampaignStore((s) => s.campaigns.length);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-border bg-card/50 backdrop-blur-xl transition-all duration-300",
        sidebarCollapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/20">
          <Building2 className="size-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">P&P Lead Finder</p>
            <p className="truncate text-xs text-muted-foreground">Panek Pugliesi</p>
          </div>
        )}
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                sidebarCollapsed && "justify-center px-2"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className={cn("size-5 shrink-0", isActive && "text-primary")} />
              {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
              {item.href === "/leads" && savedLeads.length > 0 && (
                <Badge
                  variant="success"
                  className={cn(
                    "h-5 min-w-5 justify-center px-1.5 text-[10px]",
                    sidebarCollapsed && "absolute -right-1 -top-1 size-4 p-0"
                  )}
                >
                  {savedLeads.length}
                </Badge>
              )}
              {item.href === "/campanhas" && campaignCount > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 min-w-5 justify-center px-1.5 text-[10px]",
                    sidebarCollapsed && "absolute -right-1 -top-1 size-4 p-0"
                  )}
                >
                  {campaignCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <Button
          variant="ghost"
          size={sidebarCollapsed ? "icon" : "default"}
          onClick={toggleSidebar}
          className={cn("w-full", !sidebarCollapsed && "justify-start")}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <>
              <ChevronLeft className="size-4" />
              Recolher
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

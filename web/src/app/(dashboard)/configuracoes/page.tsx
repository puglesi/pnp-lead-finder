import Link from "next/link";
import { Settings, Building2, Bell, Settings2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LocalProductionPanel } from "@/components/dashboard/local-production-panel";
import { SearchSettingsForm } from "@/components/settings/search-settings-form";

export default function ConfiguracoesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="size-7 text-blue-400" />
          Configurações
        </h2>
        <p className="text-muted-foreground">
          Performance, APIs e preferências de busca
        </p>
      </div>

      <LocalProductionPanel />

      <Card className="border-border/60 bg-gradient-to-r from-blue-500/5 to-emerald-500/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <Settings2 className="size-8 text-blue-400" />
            <div>
              <p className="font-semibold">Configurações Avançadas</p>
              <p className="text-sm text-muted-foreground">
                Workers (1–10), delay, modo 24h, fila sequencial
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/configuracoes/avancadas">
              Abrir
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <SearchSettingsForm />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="size-5 text-blue-400" />
            Empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome da Empresa</label>
              <Input defaultValue="Panek Pugliesi" className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Website</label>
              <Input
                defaultValue="https://www.panekpuglesi.co.uk"
                className="bg-background/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="size-5 text-amber-400" />
            Notificações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Receba alertas quando buscas em volume forem concluídas.
          </p>
          <Separator className="my-4" />
          <Button variant="outline">Configurar Notificações</Button>
        </CardContent>
      </Card>
    </div>
  );
}
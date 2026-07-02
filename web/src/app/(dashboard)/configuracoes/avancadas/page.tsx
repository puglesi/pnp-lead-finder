import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";
import { AdvancedSettingsForm } from "@/components/settings/advanced-settings-form";

export default function ConfiguracoesAvancadasPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/configuracoes"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          Configurações
        </Link>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings2 className="size-7 text-blue-400" />
          Configurações Avançadas
        </h2>
        <p className="text-muted-foreground">
          Workers, delay, volume e modo 24h — otimizado para Ryzen 9
        </p>
      </div>
      <AdvancedSettingsForm />
    </div>
  );
}
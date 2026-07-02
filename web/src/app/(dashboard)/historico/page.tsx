import { FullSearchHistory } from "@/components/dashboard/full-search-history";
import { SearchedSectorsHistory } from "@/components/dashboard/searched-sectors-history";

export default function HistoricoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Histórico de Buscas
        </h2>
        <p className="text-muted-foreground">
          Todas as buscas anteriores, setores pesquisados e exportações
        </p>
      </div>
      <SearchedSectorsHistory />
      <FullSearchHistory />
    </div>
  );
}
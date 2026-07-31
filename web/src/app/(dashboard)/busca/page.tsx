import { QuickSearch } from "@/components/dashboard/quick-search";
import { OneClickOutreach } from "@/components/outreach/one-click-outreach";
import { RecentSearches } from "@/components/dashboard/recent-searches";
import { SearchedSectorsHistory } from "@/components/dashboard/searched-sectors-history";

export default function BuscaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Nova Busca</h2>
        <p className="text-muted-foreground">
          Configure sua busca inteligente de empresas B2B
        </p>
      </div>
      <OneClickOutreach cardStorageKey="new-search-one-click-outreach" />
      <QuickSearch cardStorageKey="new-search-volume" />
      <SearchedSectorsHistory />
      <RecentSearches />
    </div>
  );
}

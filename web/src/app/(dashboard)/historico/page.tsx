import { redirect } from "next/navigation";

/**
 * “Histórico de Buscas” saiu do menu lateral e vive na aba do Dashboard.
 * Rota preservada para bookmarks/links antigos.
 */
export default function HistoricoPage() {
  redirect("/?tab=history");
}

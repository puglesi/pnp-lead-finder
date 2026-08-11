import { redirect } from "next/navigation";

/**
 * “Nova Busca” saiu do menu. Toda prospecção fica no Agente 1.
 * Mantemos a rota para links antigos sem apagar dados.
 */
export default function BuscaPage() {
  redirect("/agente-1?mode=bulk");
}

import { redirect } from "next/navigation";

/**
 * “Meus Leads” saiu do menu lateral e vive na aba Leads do Dashboard.
 * Rota preservada para bookmarks/links antigos.
 */
export default function LeadsPage() {
  redirect("/?tab=leads");
}

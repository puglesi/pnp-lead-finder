import type { Lead } from "@/types/lead";

export function exportLeadsToCSV(leads: Lead[], filename = "leads-export.csv") {
  const headers = [
    "Empresa",
    "Website",
    "Email",
    "Telefone",
    "Endereço",
    "Categoria",
    "Score IA",
  ];

  const rows = leads.map((lead) => [
    lead.company,
    lead.website,
    lead.email ?? "",
    lead.phone,
    lead.address,
    lead.category,
    lead.aiScore.toString(),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
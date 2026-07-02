import sys
import os
from src.lead_finder import LeadFinder

print("🔍 P&P Lead Finder - Versão Console")
print("=" * 60)
print("Desenvolvido para Panek Puglesi\n")

try:
    finder = LeadFinder()
    
    query = input("Digite o que quer buscar (ex: Estate Agents in London): ").strip()
    
    if not query:
        print("Busca cancelada.")
        sys.exit()
    
    print(f"\n🔍 Buscando leads para: {query}...")
    leads = finder.search_google_maps(query, max_results=5)
    
    if not leads:
        print("Nenhum lead encontrado.")
    else:
        print(f"\n✅ Encontrados {len(leads)} leads:")
        for i, lead in enumerate(leads, 1):
            print(f"\n{i}. {lead.get('company_name', 'N/A')}")
            print(f"   Site: {lead.get('website', 'N/A')}")
            print(f"   Endereço: {lead.get('address', 'N/A')}")
            print(f"   Categoria: {lead.get('category', 'N/A')}")
    
    print("\n📥 Exportando para Excel...")
    # Usa caminho completo para evitar problema de permissão
    export_path = os.path.join(os.getcwd(), "pnp_leads.xlsx")
    finder.export_leads(export_path)
    print(f"✅ Arquivo criado: {export_path}")

except Exception as e:
    print(f"Erro: {e}")

input("\nPressione Enter para sair...")
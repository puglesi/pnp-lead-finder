import streamlit as st
import pandas as pd
from src.lead_finder import LeadFinder
import time

st.set_page_config(page_title="P&P Lead Finder", page_icon="🔍", layout="wide")

st.title("🔍 P&P Lead Finder")
st.subheader("Plataforma Inteligente de Prospecção B2B")
st.caption("Desenvolvido para Panek Puglesi • Automatize sua prospecção comercial")

# Sidebar
with st.sidebar:
    st.header("⚙️ Configurações")
    search_type = st.selectbox("Tipo de Busca", ["Google Maps", "Google Search", "Ambas"])
    location = st.text_input("Localização (ex: London, UK)", "United Kingdom")
    max_results = st.slider("Máximo de resultados", 10, 100, 30)
    
    st.divider()
    st.info("🔄 V1 - Busca + Extração + Exportação")

# Main content
col1, col2 = st.columns([3, 1])

with col1:
    query = st.text_input("O que você quer encontrar?", 
                         placeholder="Ex: Estate Agents in London, Solicitors in Manchester...")
    
    if st.button("🚀 Iniciar Busca", type="primary", use_container_width=True):
        if query:
            with st.spinner("Buscando leads... Isso pode levar alguns segundos"):
                finder = LeadFinder()
                
                # Busca simulada
                leads = finder.search_google_maps(query, location)
                
                # Simular extração de emails
                for lead in leads:
                    if lead.get("website"):
                        emails = finder.extract_emails_from_website(lead["website"])
                        lead["emails"] = emails
                        lead["valid_emails"] = [e for e in emails if finder.validate_email(e)]
                
                st.session_state.leads = leads
                st.success(f"✅ {len(leads)} leads encontrados!")
        else:
            st.error("Digite o termo de busca!")

# Display results
if "leads" in st.session_state and st.session_state.leads:
    df = pd.DataFrame(st.session_state.leads)
    st.dataframe(df, use_container_width=True)
    
    col_exp1, col_exp2 = st.columns(2)
    with col_exp1:
        if st.button("📥 Exportar Excel"):
            finder = LeadFinder()
            finder.leads = st.session_state.leads
            finder.export_leads("pnp_leads.xlsx")
            with open("pnp_leads.xlsx", "rb") as f:
                st.download_button("Baixar arquivo", f, file_name="pnp_leads.xlsx")
    
    with col_exp2:
        if st.button("🔄 Nova Busca"):
            st.session_state.leads = None
            st.rerun()

st.divider()
st.markdown("**Próximos passos da V1:** Validação avançada de e-mails + IA de classificação")

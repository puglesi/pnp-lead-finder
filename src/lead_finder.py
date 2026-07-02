import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import re
from typing import List, Dict
import random

class LeadFinder:
    def __init__(self):
        self.leads = []
    
    def search_google_maps(self, query: str, location: str = "UK", max_results: int = 20) -> List[Dict]:
        """Busca empresas no Google Maps (simulação inicial - vamos integrar API depois)"""
        print(f"🔍 Buscando: {query} em {location}")
        # Placeholder - na próxima etapa integraremos Google Maps API ou SerpAPI
        mock_leads = [
            {
                "company_name": "Exemplo Estate Agency",
                "website": "https://example.com",
                "address": "123 Main St, London",
                "category": "Real Estate",
                "phone": "+44 20 1234 5678"
            }
        ]
        self.leads.extend(mock_leads)
        return mock_leads
    
    def extract_emails_from_website(self, website: str) -> List[str]:
        """Extrai e-mails de um website"""
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(website, headers=headers, timeout=10)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
            emails = re.findall(email_regex, response.text)
            
            # Remove duplicates
            return list(set(emails))
        except:
            return []
    
    def validate_email(self, email: str) -> bool:
        """Validação básica de e-mail"""
        if not email or '@' not in email:
            return False
        # Mais validações virão (ZeroBounce style)
        return True
    
    def export_leads(self, filename: str = "leads_encontrados.xlsx"):
        """Exporta leads para Excel"""
        if not self.leads:
            print("Nenhum lead encontrado ainda.")
            return
        
        df = pd.DataFrame(self.leads)
        df.to_excel(filename, index=False)
        print(f"✅ Leads exportados para {filename}")
        return df

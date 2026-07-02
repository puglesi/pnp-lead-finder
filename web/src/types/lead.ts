export interface Lead {
  id: string;
  company: string;
  website: string;
  email: string | null;
  phone: string;
  address: string;
  category: string;
  aiScore: number;
  savedAt?: string;
}

export interface SearchRecord {
  id: string;
  keyword: string;
  location: string;
  resultsCount: number;
  date: string;
  leads?: Lead[];
}

export interface DashboardStats {
  companiesFound: number;
  validEmails: number;
  conversionRate: number;
  leadsToday: number;
}

export function leadFingerprint(lead: Pick<Lead, "company" | "website">) {
  return `${lead.company.toLowerCase()}|${lead.website.toLowerCase()}`;
}
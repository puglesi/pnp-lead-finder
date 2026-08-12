import type { EmailValidationProviderId, EmailValidationStatus } from "./email-validation";

export interface Lead {
  id: string;
  company: string;
  website: string;
  email: string | null;
  phone: string;
  address: string;
  category: string;
  aiScore: number;
  /** Search/handoff batch this lead belongs to (never mix without explicit action). */
  batchId?: string;
  /** Per-file import batch — campaign membership uses only the current upload. */
  importBatchId?: string;
  savedAt?: string;
  emailValidationStatus?: EmailValidationStatus;
  emailValidationReason?: string;
  normalizedEmail?: string;
  emailValidatedAt?: string;
  emailValidationProvider?: EmailValidationProviderId;
  emailDomain?: string;
  hasMxRecords?: boolean;
  isRoleBasedEmail?: boolean;
}

export interface SearchRecord {
  id: string;
  keyword: string;
  location: string;
  resultsCount: number;
  date: string;
  leads?: Lead[];
  batchId?: string;
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
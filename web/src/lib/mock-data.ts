import type { DashboardStats, Lead, SearchRecord } from "@/types/lead";

export const MOCK_MAX_RESULTS = 500;

export const dashboardStats: DashboardStats = {
  companiesFound: 2847,
  validEmails: 1923,
  conversionRate: 67.5,
  leadsToday: 142,
};

export const recentSearches: SearchRecord[] = [
  {
    id: "1",
    keyword: "Estate Agents",
    location: "London",
    resultsCount: 50,
    date: "2026-07-01T10:30:00",
  },
  {
    id: "2",
    keyword: "Solicitors",
    location: "Manchester",
    resultsCount: 50,
    date: "2026-06-30T15:45:00",
  },
  {
    id: "3",
    keyword: "Builders",
    location: "Birmingham",
    resultsCount: 50,
    date: "2026-06-30T09:20:00",
  },
  {
    id: "4",
    keyword: "Estate Agents",
    location: "Leeds",
    resultsCount: 50,
    date: "2026-06-29T14:10:00",
  },
  {
    id: "5",
    keyword: "Solicitors",
    location: "Bristol",
    resultsCount: 50,
    date: "2026-06-29T11:00:00",
  },
];

interface StreetEntry {
  line: string;
  postcode: string;
}

interface CityProfile {
  areaCode: string;
  streets: StreetEntry[];
}

const UK_CITIES: Record<string, CityProfile> = {
  london: {
    areaCode: "20",
    streets: [
      { line: "66-68 South Lambeth Road", postcode: "SW8 1RL" },
      { line: "33 Margaret Street", postcode: "W1G 0JD" },
      { line: "77-79 New King's Road", postcode: "SW6 4SQ" },
      { line: "167 Kensington High Street", postcode: "W8 6SH" },
      { line: "45 Tabernacle Street", postcode: "EC2A 4AA" },
      { line: "1 Sail Street", postcode: "SE11 6NQ" },
      { line: "236 Gray's Inn Road", postcode: "WC1X 8HB" },
      { line: "12 Commercial Street", postcode: "E1 6LP" },
      { line: "85 Fleet Street", postcode: "EC4Y 1AE" },
      { line: "22 Baker Street", postcode: "W1U 3BW" },
      { line: "14 Clerkenwell Green", postcode: "EC1R 0DP" },
      { line: "88 Kingsway", postcode: "WC2B 6AA" },
    ],
  },
  manchester: {
    areaCode: "161",
    streets: [
      { line: "58 Mosley Street", postcode: "M2 3HZ" },
      { line: "1 Spinningfields Square", postcode: "M3 3AP" },
      { line: "111 Piccadilly", postcode: "M1 2HY" },
      { line: "24 Mount Street", postcode: "M2 4WU" },
      { line: "8 John Dalton Street", postcode: "M2 6LW" },
      { line: "2 Exchange Square", postcode: "M4 3BR" },
      { line: "15 Deansgate", postcode: "M3 4EN" },
      { line: "42 King Street West", postcode: "M3 2NU" },
    ],
  },
  bristol: {
    areaCode: "117",
    streets: [
      { line: "1 Queen Square", postcode: "BS1 4ND" },
      { line: "12 Colston Avenue", postcode: "BS1 4ST" },
      { line: "33 Park Street", postcode: "BS1 5NH" },
      { line: "7 Whiteladies Road", postcode: "BS8 2NN" },
      { line: "18 Baldwin Street", postcode: "BS1 1SE" },
      { line: "55 Corn Street", postcode: "BS1 1HT" },
    ],
  },
  birmingham: {
    areaCode: "121",
    streets: [
      { line: "1 Colmore Row", postcode: "B3 2BJ" },
      { line: "55 Newhall Street", postcode: "B3 3RB" },
      { line: "12 Broad Street", postcode: "B1 2HF" },
      { line: "8 Brindleyplace", postcode: "B1 2JB" },
      { line: "100 Broad Street", postcode: "B15 1AU" },
      { line: "45 Corporation Street", postcode: "B2 4LS" },
    ],
  },
  leeds: {
    areaCode: "113",
    streets: [
      { line: "1 City Square", postcode: "LS1 2HT" },
      { line: "14 Park Row", postcode: "LS1 5HD" },
      { line: "22 The Headrow", postcode: "LS1 6PU" },
      { line: "8 Wellington Street", postcode: "LS1 4DL" },
      { line: "55 Boar Lane", postcode: "LS1 5EL" },
    ],
  },
  edinburgh: {
    areaCode: "131",
    streets: [
      { line: "1 George Street", postcode: "EH2 2LL" },
      { line: "25 Lothian Road", postcode: "EH1 2DJ" },
      { line: "12 Hanover Street", postcode: "EH2 2DL" },
      { line: "44 Queen Street", postcode: "EH2 3NH" },
      { line: "8 Morrison Street", postcode: "EH3 8BJ" },
    ],
  },
  liverpool: {
    areaCode: "151",
    streets: [
      { line: "1 Mann Island", postcode: "L3 1BP" },
      { line: "25 Castle Street", postcode: "L2 4TA" },
      { line: "10 Old Hall Street", postcode: "L3 9QJ" },
      { line: "55 Rodney Street", postcode: "L1 9EX" },
    ],
  },
  glasgow: {
    areaCode: "141",
    streets: [
      { line: "1 West George Street", postcode: "G2 1BD" },
      { line: "120 St Vincent Street", postcode: "G2 5HF" },
      { line: "45 Buchanan Street", postcode: "G1 3HL" },
      { line: "8 Royal Exchange Square", postcode: "G1 3AG" },
    ],
  },
  sheffield: {
    areaCode: "114",
    streets: [
      { line: "1 Furnival Gate", postcode: "S1 2QP" },
      { line: "55 Pinstone Street", postcode: "S1 2HP" },
      { line: "12 Leopold Street", postcode: "S1 2GZ" },
    ],
  },
  newcastle: {
    areaCode: "191",
    streets: [
      { line: "1 Grey Street", postcode: "NE1 6EE" },
      { line: "55 Pilgrim Street", postcode: "NE1 6SF" },
      { line: "12 Mosley Street", postcode: "NE1 1DE" },
    ],
  },
};

const EMAIL_PREFIXES = [
  "info",
  "contact",
  "hello",
  "enquiries",
  "office",
  "sales",
  "team",
] as const;

const BRANCH_SUFFIXES = [
  "",
  " — City Centre",
  " — North",
  " — South",
  " — West End",
  " Ltd",
  " & Partners",
  " Group",
  " UK",
];

interface CompanyTemplate {
  name: string;
  domain: string;
  preferredEmail?: (typeof EMAIL_PREFIXES)[number];
}

const CATEGORY_COMPANIES: Record<string, CompanyTemplate[]> = {
  "Estate Agents": [
    { name: "Foxtons", domain: "foxtons.co.uk", preferredEmail: "contact" },
    { name: "Savills", domain: "savills.co.uk", preferredEmail: "info" },
    { name: "Hamptons International", domain: "hamptons.co.uk", preferredEmail: "hello" },
    { name: "Winkworth", domain: "winkworth.co.uk", preferredEmail: "info" },
    { name: "Knight Frank", domain: "knightfrank.co.uk", preferredEmail: "contact" },
    { name: "Chestertons", domain: "chestertons.co.uk", preferredEmail: "info" },
    { name: "Dexters", domain: "dexters.co.uk", preferredEmail: "hello" },
    { name: "Marsh & Parsons", domain: "marshandparsons.co.uk", preferredEmail: "contact" },
    { name: "Strutt & Parker", domain: "struttandparker.com", preferredEmail: "info" },
    { name: "JLL Residential", domain: "jll.co.uk", preferredEmail: "enquiries" },
    { name: "Purplebricks", domain: "purplebricks.co.uk", preferredEmail: "hello" },
    { name: "Connells", domain: "connells.co.uk", preferredEmail: "info" },
    { name: "Leaders Romans Group", domain: "leaders.co.uk", preferredEmail: "contact" },
    { name: "Your Move", domain: "your-move.co.uk", preferredEmail: "info" },
    { name: "Bairstow Eves", domain: "bairstoweves.co.uk", preferredEmail: "hello" },
    { name: "Hunters Estate Agents", domain: "hunters.com", preferredEmail: "contact" },
    { name: "Romans Estate Agents", domain: "romans.co.uk", preferredEmail: "info" },
    { name: "Northwood", domain: "northwooduk.com", preferredEmail: "office" },
    { name: "Belvoir", domain: "belvoir.co.uk", preferredEmail: "hello" },
    { name: "Martin & Co", domain: "martinco.com", preferredEmail: "info" },
    { name: "Chancellors", domain: "chancellors.co.uk", preferredEmail: "contact" },
    { name: "Haart", domain: "haart.co.uk", preferredEmail: "info" },
    { name: "Fine & Country", domain: "fineandcountry.com", preferredEmail: "hello" },
    { name: "Jackson-Stops", domain: "jackson-stops.co.uk", preferredEmail: "contact" },
    { name: "City Living London", domain: "citylivinglondon.co.uk", preferredEmail: "info" },
    { name: "Urban Nest Estates", domain: "urbannestestates.co.uk", preferredEmail: "hello" },
    { name: "Metro Lettings", domain: "metrolettings.co.uk", preferredEmail: "contact" },
    { name: "Capital Property Partners", domain: "capitalpropertypartners.co.uk", preferredEmail: "info" },
    { name: "Prime Homes UK", domain: "primehomesuk.co.uk", preferredEmail: "hello" },
    { name: "Harbour Estates", domain: "harbourestates.co.uk", preferredEmail: "office" },
  ],
  Solicitors: [
    { name: "Slater and Gordon", domain: "slatergordon.co.uk", preferredEmail: "enquiries" },
    { name: "Irwin Mitchell", domain: "irwinmitchell.com", preferredEmail: "contact" },
    { name: "Bindmans LLP", domain: "bindmans.com", preferredEmail: "info" },
    { name: "Mishcon de Reya", domain: "mishcon.com", preferredEmail: "hello" },
    { name: "CMS UK", domain: "cms.law", preferredEmail: "info" },
    { name: "DWF Law", domain: "dwf.law", preferredEmail: "contact" },
    { name: "Weightmans", domain: "weightmans.com", preferredEmail: "enquiries" },
    { name: "Gordons LLP", domain: "gordonsllp.com", preferredEmail: "info" },
    { name: "TLT LLP", domain: "tlt.com", preferredEmail: "hello" },
    { name: "Shoosmiths", domain: "shoosmiths.co.uk", preferredEmail: "contact" },
    { name: "Pinsent Masons", domain: "pinsentmasons.com", preferredEmail: "info" },
    { name: "Eversheds Sutherland", domain: "eversheds-sutherland.com", preferredEmail: "enquiries" },
    { name: "Addleshaw Goddard", domain: "addleshawgoddard.com", preferredEmail: "contact" },
    { name: "Browne Jacobson", domain: "brownejacobson.com", preferredEmail: "info" },
    { name: "Gateley Legal", domain: "gateleyplc.com", preferredEmail: "hello" },
    { name: "Hill Dickinson", domain: "hilldickinson.com", preferredEmail: "contact" },
    { name: "Hempsons Solicitors", domain: "hempsons.co.uk", preferredEmail: "info" },
    { name: "Blake Morgan", domain: "blakemorgan.co.uk", preferredEmail: "enquiries" },
    { name: "City Legal Chambers", domain: "citylegalchambers.co.uk", preferredEmail: "hello" },
    { name: "Harbor Law Partners", domain: "harborlaw.co.uk", preferredEmail: "contact" },
    { name: "Bridge Solicitors", domain: "bridgesolicitors.co.uk", preferredEmail: "info" },
    { name: "Northgate Legal", domain: "northgatelegal.co.uk", preferredEmail: "office" },
    { name: "Sterling & Co Solicitors", domain: "sterlingco.co.uk", preferredEmail: "hello" },
    { name: "Apex Legal Services", domain: "apexlegal.co.uk", preferredEmail: "contact" },
  ],
  Builders: [
    { name: "Barratt Developments", domain: "barrattdevelopments.co.uk", preferredEmail: "enquiries" },
    { name: "Taylor Wimpey", domain: "taylorwimpey.co.uk", preferredEmail: "info" },
    { name: "Bellway Homes", domain: "bellway.co.uk", preferredEmail: "contact" },
    { name: "Persimmon Homes", domain: "persimmonhomes.com", preferredEmail: "info" },
    { name: "Redrow", domain: "redrow.co.uk", preferredEmail: "hello" },
    { name: "Berkeley Group", domain: "berkeleygroup.co.uk", preferredEmail: "contact" },
    { name: "Vistry Group", domain: "vistrygroup.co.uk", preferredEmail: "info" },
    { name: "Countryside Partnerships", domain: "countryside-partnerships.com", preferredEmail: "enquiries" },
    { name: "Galliford Try", domain: "gallifordtry.co.uk", preferredEmail: "contact" },
    { name: "Morgan Sindall Construction", domain: "morgansindallconstruction.com", preferredEmail: "info" },
    { name: "Balfour Beatty", domain: "balfourbeatty.com", preferredEmail: "hello" },
    { name: "Kier Group", domain: "kier.co.uk", preferredEmail: "contact" },
    { name: "Wates Group", domain: "wates.co.uk", preferredEmail: "info" },
    { name: "McLaren Construction", domain: "mclarenconstruction.com", preferredEmail: "enquiries" },
    { name: "Apex Construction Group", domain: "apexconstruction.co.uk", preferredEmail: "hello" },
    { name: "Heritage Builders UK", domain: "heritagebuilders.co.uk", preferredEmail: "contact" },
    { name: "Summit Developments", domain: "summitdevelopments.co.uk", preferredEmail: "info" },
    { name: "Oakwood Building Services", domain: "oakwoodbuilding.co.uk", preferredEmail: "office" },
    { name: "Premier Build Solutions", domain: "premierbuild.co.uk", preferredEmail: "hello" },
    { name: "Stonebridge Contractors", domain: "stonebridgecontractors.co.uk", preferredEmail: "contact" },
  ],
  Cleaners: [
    { name: "Merry Maids UK", domain: "merrymaids.co.uk", preferredEmail: "info" },
    { name: "Cleanology", domain: "cleanology.co.uk", preferredEmail: "hello" },
    { name: "ISS Facility Services", domain: "uk.issworld.com", preferredEmail: "contact" },
    { name: "Mitie Cleaning", domain: "mitie.com", preferredEmail: "info" },
    { name: "Sodexo UK", domain: "sodexo.co.uk", preferredEmail: "enquiries" },
    { name: "Rentokil Initial", domain: "rentokil-initial.co.uk", preferredEmail: "info" },
    { name: "Sparkle Clean London", domain: "sparkleclean.co.uk", preferredEmail: "hello" },
    { name: "Fresh Spaces Cleaning", domain: "freshspaces.co.uk", preferredEmail: "contact" },
    { name: "ProClean UK", domain: "procleanuk.co.uk", preferredEmail: "info" },
    { name: "Crystal Clear Services", domain: "crystalclearservices.co.uk", preferredEmail: "hello" },
    { name: "Bright Home Cleaning", domain: "brighthomecleaning.co.uk", preferredEmail: "office" },
    { name: "Pristine Office Care", domain: "pristineofficecare.co.uk", preferredEmail: "contact" },
    { name: "EcoShine Cleaning", domain: "ecoshine.co.uk", preferredEmail: "hello" },
    { name: "City Clean Solutions", domain: "citycleansolutions.co.uk", preferredEmail: "info" },
  ],
  Plumbers: [
    { name: "Pimlico Plumbers", domain: "pimlicoplumbers.com", preferredEmail: "enquiries" },
    { name: "British Gas HomeCare", domain: "britishgas.co.uk", preferredEmail: "contact" },
    { name: "Wolseley UK", domain: "wolseley.co.uk", preferredEmail: "info" },
    { name: "Dyno-Rod", domain: "dyno.com", preferredEmail: "hello" },
    { name: "HomeServe", domain: "homeserve.com", preferredEmail: "info" },
    { name: "Local Heroes", domain: "localheroes.com", preferredEmail: "contact" },
    { name: "FlowFix Plumbing", domain: "flowfixplumbing.co.uk", preferredEmail: "hello" },
    { name: "AquaPro Services", domain: "aquaproservices.co.uk", preferredEmail: "info" },
    { name: "Rapid Pipe Solutions", domain: "rapidpipe.co.uk", preferredEmail: "contact" },
    { name: "Thames Valley Heating", domain: "thamesvalleyheating.co.uk", preferredEmail: "office" },
    { name: "Northern Gas & Plumbing", domain: "northerngasplumbing.co.uk", preferredEmail: "hello" },
    { name: "Emergency Plumber 24/7", domain: "emergencyplumber247.co.uk", preferredEmail: "info" },
    { name: "Copper Pipe Specialists", domain: "copperpipespecialists.co.uk", preferredEmail: "contact" },
    { name: "Heatwave Plumbing", domain: "heatwaveplumbing.co.uk", preferredEmail: "hello" },
  ],
  Accountants: [
    { name: "PwC UK", domain: "pwc.co.uk", preferredEmail: "info" },
    { name: "Deloitte UK", domain: "deloitte.co.uk", preferredEmail: "contact" },
    { name: "KPMG UK", domain: "kpmg.co.uk", preferredEmail: "hello" },
    { name: "BDO LLP", domain: "bdo.co.uk", preferredEmail: "info" },
    { name: "Grant Thornton UK", domain: "grantthornton.co.uk", preferredEmail: "contact" },
    { name: "RSM UK", domain: "rsmuk.com", preferredEmail: "enquiries" },
    { name: "Mazars UK", domain: "mazars.co.uk", preferredEmail: "info" },
    { name: "Haines Watts", domain: "haineswatts.co.uk", preferredEmail: "hello" },
    { name: "Moore UK", domain: "moore.co.uk", preferredEmail: "contact" },
    { name: "City Accounts Partners", domain: "cityaccounts.co.uk", preferredEmail: "info" },
  ],
  Dentists: [
    { name: "Bupa Dental Care", domain: "bupa.co.uk", preferredEmail: "info" },
    { name: "mydentist", domain: "mydentist.co.uk", preferredEmail: "hello" },
    { name: "Rodericks Dental", domain: "rodericksdental.co.uk", preferredEmail: "contact" },
    { name: "PortmanDentex", domain: "portmandentex.com", preferredEmail: "enquiries" },
    { name: "Smile Dental Care", domain: "smiledentalcare.co.uk", preferredEmail: "hello" },
    { name: "Harley Street Dental", domain: "harleystreetdental.co.uk", preferredEmail: "info" },
    { name: "Bright Smile Clinic", domain: "brightsmileclinic.co.uk", preferredEmail: "contact" },
  ],
  Architects: [
    { name: "Foster + Partners", domain: "fosterandpartners.com", preferredEmail: "info" },
    { name: "Zaha Hadid Architects", domain: "zaha-hadid.com", preferredEmail: "hello" },
    { name: "AHMM", domain: "ahmm.co.uk", preferredEmail: "contact" },
    { name: "Allies and Morrison", domain: "alliesandmorrison.com", preferredEmail: "info" },
    { name: "Studio Egret West", domain: "egretwest.com", preferredEmail: "hello" },
    { name: "Urban Design Collective", domain: "urbandesigncollective.co.uk", preferredEmail: "contact" },
  ],
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  "Estate Agents": ["estate agents", "estate agent", "letting agents", "property"],
  Solicitors: ["solicitors", "solicitor", "lawyers", "law firm"],
  Builders: ["builders", "builder", "construction", "home builders"],
  Cleaners: ["cleaners", "cleaner", "cleaning", "domestic cleaning"],
  Plumbers: ["plumbers", "plumber", "plumbing", "heating engineer"],
  Accountants: ["accountants", "accountant", "accounting", "chartered accountant"],
  Dentists: ["dentists", "dentist", "dental practice"],
  Architects: ["architects", "architect", "architecture"],
};

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seededUnit(seed: number, index: number): number {
  const x = Math.sin(seed + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function normalizeCity(location: string): { key: string; label: string } {
  const raw = location.trim().toLowerCase();
  const key = raw.replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    london: "london",
    manchester: "manchester",
    bristol: "bristol",
    birmingham: "birmingham",
    leeds: "leeds",
    edinburgh: "edinburgh",
    liverpool: "liverpool",
    glasgow: "glasgow",
    sheffield: "sheffield",
    newcastle: "newcastle",
    newcastleupontyne: "newcastle",
  };
  const resolved = aliases[key] ?? "london";
  const label =
    location.trim().charAt(0).toUpperCase() +
    location.trim().slice(1).toLowerCase();
  return { key: resolved, label };
}

export function resolveCategory(keyword: string): string {
  const normalized = keyword.toLowerCase().trim();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (
      aliases.some(
        (alias) => normalized.includes(alias) || alias.includes(normalized)
      )
    ) {
      return category;
    }
  }
  return keyword.trim() || "Business Services";
}

function getCompaniesForCategory(category: string): CompanyTemplate[] {
  if (CATEGORY_COMPANIES[category]) return CATEGORY_COMPANIES[category];
  const slug = category.toLowerCase().replace(/\s+/g, "");
  return Array.from({ length: 20 }, (_, i) => ({
    name: `${category} ${["Partners", "Solutions", "Group", "Direct", "Pro"][i % 5]} ${i + 1}`,
    domain: `${slug}${i + 1}.co.uk`,
    preferredEmail: EMAIL_PREFIXES[i % EMAIL_PREFIXES.length],
  }));
}

function formatUkPhone(areaCode: string, seed: number, index: number): string {
  const a = Math.floor(seededUnit(seed, index) * 9000) + 1000;
  const b = Math.floor(seededUnit(seed, index + 1) * 9000) + 1000;
  if (areaCode === "20") {
    return `+44 ${areaCode} ${Math.floor(seededUnit(seed, index + 2) * 7000) + 3000} ${b}`;
  }
  return `+44 ${areaCode} ${a} ${b}`;
}

function buildEmail(
  template: CompanyTemplate,
  seed: number,
  index: number,
  hasEmail: boolean
): string | null {
  if (!hasEmail) return null;
  const prefix =
    template.preferredEmail ??
    EMAIL_PREFIXES[Math.floor(seededUnit(seed, index + 3) * EMAIL_PREFIXES.length)];
  return `${prefix}@${template.domain}`;
}

function buildAiScore(seed: number, index: number, hasEmail: boolean): number {
  const roll = seededUnit(seed, index + 5);
  let score: number;
  if (roll < 0.15) score = 85 + Math.floor(seededUnit(seed, index + 6) * 14);
  else if (roll < 0.65) score = 70 + Math.floor(seededUnit(seed, index + 7) * 15);
  else score = 58 + Math.floor(seededUnit(seed, index + 8) * 12);
  if (!hasEmail) score = Math.max(52, score - 12);
  return Math.min(99, Math.max(52, score));
}

function buildSingleLead(
  keyword: string,
  location: string,
  globalIndex: number
): Lead {
  const category = resolveCategory(keyword);
  const companies = getCompaniesForCategory(category);
  const { key: cityKey, label: cityLabel } = normalizeCity(location);
  const city = UK_CITIES[cityKey] ?? UK_CITIES.london;

  const seed = hashSeed(`${keyword}|${location}|${category}`);
  const companyIdx =
    Math.floor(seededUnit(seed, globalIndex) * companies.length) +
    (globalIndex % companies.length);
  const template = companies[companyIdx % companies.length];
  const suffix = BRANCH_SUFFIXES[globalIndex % BRANCH_SUFFIXES.length];
  const street = city.streets[globalIndex % city.streets.length];
  const unit = globalIndex % 2 === 0 ? "" : `, Suite ${(globalIndex % 12) + 1}`;

  const hasEmail = seededUnit(seed, globalIndex + 9) > 0.12;
  const companyName = `${template.name}${suffix}`.trim();

  return {
    id: `mock-${hashSeed(`${keyword}-${location}-${globalIndex}`)}-${globalIndex}`,
    company: companyName,
    website: `https://www.${template.domain}`,
    email: buildEmail(template, seed, globalIndex, hasEmail),
    phone: formatUkPhone(city.areaCode, seed, globalIndex),
    address: `${street.line}${unit}, ${cityLabel} ${street.postcode}`,
    category,
    aiScore: buildAiScore(seed, globalIndex, hasEmail),
  };
}

export function generateLeadsForSearch(
  keyword: string,
  location: string,
  maxResults = 20,
  offset = 0
): Lead[] {
  const count = Math.min(MOCK_MAX_RESULTS, Math.max(1, maxResults));
  const results: Lead[] = [];

  for (let i = 0; i < count; i++) {
    results.push(buildSingleLead(keyword, location, offset + i));
  }

  return results;
}

export function getMockLeadStats(leads: Lead[]) {
  if (leads.length === 0) {
    return {
      total: 0,
      withEmail: 0,
      emailPct: 0,
      avgScore: 0,
      highScore: 0,
      categories: 0,
    };
  }
  const withEmail = leads.filter((l) => l.email).length;
  const avgScore = Math.round(
    leads.reduce((sum, l) => sum + l.aiScore, 0) / leads.length
  );
  const highScore = leads.filter((l) => l.aiScore >= 85).length;
  const categories = new Set(leads.map((l) => l.category)).size;

  return {
    total: leads.length,
    withEmail,
    emailPct: Math.round((withEmail / leads.length) * 100),
    avgScore,
    highScore,
    categories,
  };
}

/** @deprecated Use generateLeadsForSearch — kept for seed data compatibility */
export const mockLeads: Lead[] = generateLeadsForSearch(
  "Estate Agents",
  "London",
  14
);
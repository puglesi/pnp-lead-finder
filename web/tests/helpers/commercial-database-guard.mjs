import { readFileSync } from "node:fs";

const FORBIDDEN_COMMERCIAL_DATABASE_REFERENCES = [
  { label: "commercial database filename", pattern: /pnp-lead-finder[.]sqlite/i },
  { label: "legacy real-database alias", pattern: /\bREAL_DB\b/ },
  { label: "direct SQLite access", pattern: /node:sqlite|\bDatabaseSync\b/ },
];

/**
 * These Agent 3 tests are intentionally in-memory. Run this at module load so a
 * future direct reference to the commercial database fails before any test body.
 */
export function assertNoCommercialDatabaseAccess(testFileUrl) {
  const sourceUrl =
    testFileUrl instanceof URL ? testFileUrl : new URL(testFileUrl);
  const source = readFileSync(sourceUrl, "utf8");
  for (const forbidden of FORBIDDEN_COMMERCIAL_DATABASE_REFERENCES) {
    if (forbidden.pattern.test(source)) {
      throw new Error(
        `Hermetic test guard: ${forbidden.label} is forbidden in ${sourceUrl.pathname}.`
      );
    }
  }
}

import { checkEmailDomain } from "@/lib/email-domain-check";

export const runtime = "nodejs";

const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isDomain(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 253) return false;
  const labels = value.trim().split(".");
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL_PATTERN.test(label));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("domain" in body) ||
    !isDomain(body.domain)
  ) {
    return Response.json({ error: "invalid_domain" }, { status: 400 });
  }

  const result = await checkEmailDomain(body.domain);
  return Response.json(result);
}

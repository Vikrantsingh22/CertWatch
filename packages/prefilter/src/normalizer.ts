import { parse } from 'tldts';

// Characters attackers substitute to evade simple string matching
// e.g. "paypa1.com", "g00gle.com", "rn" looks like "m" etc.
const HOMOGLYPH_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '@': 'a',
  'vv': 'w',  // "vvells" → "wells"
  'rn': 'm',  // "rnicro" → "micro"
  'cl': 'd',  // "clisney" → "disney"
  'ii': 'n',  // rare but used
};

export interface NormalizedDomain {
  original: string;       // "paytm-secure-login.com"
  registrable: string;    // "paytm-secure-login.com" (strips subdomains)
  domainWithoutTld: string; // "paytm-secure-login"
  normalized: string;     // "paytm-secure-login" (homoglyphs replaced)
  tokens: string[];       // ["paytm", "secure", "login"]
  tld: string;            // "com"
}

export function normalizeDomain(domain: string): NormalizedDomain | null {
  try {
    const parsed = parse(domain);
    if (!parsed.domain || !parsed.publicSuffix) return null;

    const registrable = parsed.domain;  // "paytm-secure-login.com"
    const tld = parsed.publicSuffix;    // "com"

    // domainBody = registrable without TLD = "paytm-secure-login"
    const domainBody = registrable
      .slice(0, registrable.length - tld.length - 1)
      .toLowerCase();

    // Apply homoglyphs
    let normalized = domainBody;
    for (const [glyph, replacement] of Object.entries(HOMOGLYPH_MAP)) {
      normalized = normalized.split(glyph).join(replacement);
    }

    // Tokenize the domain BODY only (not subdomains)
    const tokens = normalized
      .split(/[-.]/)
      .filter(t => t.length >= 3); // minimum 3 chars to avoid noise from "www", "en", "my"

    return {
      original: domain,
      registrable,         // full registrable: "paytm-secure-login.com"
      domainWithoutTld: domainBody,
      normalized,
      tokens,
      tld,
    };
  } catch {
    return null;
  }
}
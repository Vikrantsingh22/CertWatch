import { distance } from 'fastest-levenshtein';
import { SUSPICIOUS_KEYWORDS } from './watchlist.data';

export interface SimilarityResult {
  matched: boolean;
  brand: string | null;
  score: number;           // 0-1, higher = more similar
  matchReason: 'similarity' | 'token_match' | 'keyword_combo' | null;
  keyword: string | null;  // which suspicious keyword triggered
}

// Jaro-Winkler gives better results than raw Levenshtein for domain similarity
// because it weights prefix matches more heavily — "paypal" vs "paypai" scores higher than Levenshtein alone
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchWindow < 0) return 0.0;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function checkSimilarity(
  normalized: string,      // normalized domain without TLD
  tokens: string[],        // tokenized domain parts
  brands: string[],        // brand watchlist names
  legitDomainMap: Map<string, string[]>, // brand → legit domains
  originalDomain: string,  // for legit domain check
  threshold: number = 0.75
): SimilarityResult {

  for (const brand of brands) {
    // 1. Skip if this is actually a legit domain for the brand
    const legitDomains = legitDomainMap.get(brand) || [];
    if (legitDomains.some(legit => originalDomain === legit || originalDomain.endsWith(`.${legit}`))) {
      continue;
    }

    // 2. Direct token match — domain contains exact brand name as a token
    // e.g. "paytm-secure.com" → tokens["paytm", "secure"] → exact match "paytm"
    if (tokens.includes(brand)) {
      // Brand token present — check if there's also a suspicious keyword
      const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
      if (keyword) {
        // High confidence: exact brand token + suspicious keyword
        return { matched: true, brand, score: 0.95, matchReason: 'keyword_combo', keyword };
      }
      // Brand token present but no suspicious keyword — still flag but lower confidence
      return { matched: true, brand, score: 0.85, matchReason: 'token_match', keyword: null };
    }

    // 3. Jaro-Winkler similarity on full normalized domain vs brand
    const jwScore = jaroWinkler(normalized, brand);
    if (jwScore >= threshold) {
      const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
      return { matched: true, brand, score: jwScore, matchReason: 'similarity', keyword };
    }

    // 4. Levenshtein on each token vs brand (catches "paytml" or "paytmm" typos)
    for (const token of tokens) {
      if (token.length < 4) continue; // skip short tokens — too many false positives
      const lev = distance(token, brand);
      const maxLen = Math.max(token.length, brand.length);
      const levScore = 1 - lev / maxLen;
      if (levScore >= threshold) {
        const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
        return { matched: true, brand, score: levScore, matchReason: 'similarity', keyword };
      }
    }
  }

  return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };
}
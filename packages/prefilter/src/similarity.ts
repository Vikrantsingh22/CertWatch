import { distance } from 'fastest-levenshtein';
import { SUSPICIOUS_KEYWORDS } from './watchlist.data';

export interface SimilarityResult {
  matched: boolean;
  brand: string | null;
  score: number;
  matchReason: 'exact_keyword' | 'similarity_keyword' | 'similarity_strong' | null;
  keyword: string | null;
}

// TIER 1: Short brands (≤ 4 chars): sbi, cred, gpay, hdfc
// Rule: ONLY match if brand appears as an EXACT TOKEN + suspicious keyword present
// Never use similarity scoring on short brands — too noisy
function matchShortBrand(brand: string, tokens: string[]): SimilarityResult {
  const hasExactToken = tokens.includes(brand);
  if (!hasExactToken) return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };

  const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
  if (!keyword) return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };

  return { matched: true, brand, score: 1.0, matchReason: 'exact_keyword', keyword };
}

// TIER 2: Medium brands (5-7 chars): paytm, apple, google, amazon, paypal
// Rule: Exact token match (with OR without keyword), OR high-confidence similarity (≥ 0.88) + keyword
function matchMediumBrand(
  brand: string,
  tokens: string[],
  normalized: string
): SimilarityResult {
  // Exact token match
  if (tokens.includes(brand)) {
    const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
    // For medium brands, exact token alone is suspicious enough
    return {
      matched: true, brand,
      score: keyword ? 0.95 : 0.85,
      matchReason: keyword ? 'exact_keyword' : 'similarity_strong',
      keyword,
    };
  }

  // Similarity — but only on tokens of similar length to the brand (±2 chars)
  // This prevents "microtooth" (10 chars) falsely matching "microsoft" (9 chars) via prefix
  for (const token of tokens) {
    if (Math.abs(token.length - brand.length) > 2) continue; // length guard
    if (token.length < brand.length - 1) continue;           // token too short

    const lev = distance(token, brand);
    const maxLen = Math.max(token.length, brand.length);
    const levScore = 1 - lev / maxLen;

    if (levScore >= 0.88) { // HIGH threshold for medium brands
      const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
      if (!keyword) continue; // similarity alone not enough for medium brands — need keyword too
      return { matched: true, brand, score: levScore, matchReason: 'similarity_keyword', keyword };
    }
  }

  return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };
}

// TIER 3: Long brands (≥ 8 chars): microsoft, facebook, instagram, icicibank, razorpay, axisbank
// Rule: Exact token match only (similarity on long brands creates too many substring false positives)
// Exception: allow 1-char typo (levenshtein distance = 1) + keyword
function matchLongBrand(brand: string, tokens: string[]): SimilarityResult {
  // Exact token
  if (tokens.includes(brand)) {
    const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
    return {
      matched: true, brand,
      score: keyword ? 0.95 : 0.85,
      matchReason: keyword ? 'exact_keyword' : 'similarity_strong',
      keyword,
    };
  }

  // Allow exactly 1 edit distance (e.g. "facebok" → "facebook", "instagran" → "instagram")
  for (const token of tokens) {
    if (Math.abs(token.length - brand.length) > 1) continue;
    const lev = distance(token, brand);
    if (lev <= 1) {
      const keyword = tokens.find(t => SUSPICIOUS_KEYWORDS.includes(t)) ?? null;
      if (!keyword) continue; // 1-char typo alone not enough — need keyword
      return { matched: true, brand, score: 0.92, matchReason: 'similarity_keyword', keyword };
    }
  }

  return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };
}

export function checkSimilarity(
  normalized: string,
  tokens: string[],
  brands: Array<{ brand: string; legitDomains: string[] }>,
  originalRegistrable: string, // e.g. "paytm-secure.com" (registrable domain only, no subdomains)
): SimilarityResult {

  for (const { brand, legitDomains } of brands) {
    // Always skip legit domains (expanded list)
    if (legitDomains.some(legit =>
      originalRegistrable === legit ||
      originalRegistrable.endsWith(`.${legit}`)
    )) continue;

    const brandLen = brand.length;
    let result: SimilarityResult;

    if (brandLen <= 4) {
      result = matchShortBrand(brand, tokens);
    } else if (brandLen <= 7) {
      result = matchMediumBrand(brand, tokens, normalized);
    } else {
      result = matchLongBrand(brand, tokens);
    }

    if (result.matched) return result;
  }

  return { matched: false, brand: null, score: 0, matchReason: null, keyword: null };
}
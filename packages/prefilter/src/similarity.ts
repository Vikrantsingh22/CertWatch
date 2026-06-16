import { distance } from 'fastest-levenshtein';

export const SUSPICIOUS_KEYWORDS: string[] = [
  'login',
  'verify',
  'confirm',
  'update',
  'secure',
  'auth',
];

export function computeSimilarity(domain: string, brand: string): number {
  // Stub implementation
  return 0;
}

export function containsSuspiciousKeyword(domain: string): boolean {
  // Stub implementation
  return false;
}

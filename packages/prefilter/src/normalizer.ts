import { parse } from 'tldts';

export const HOMOGLYPH_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  '5': 's',
  '8': 'b',
};

export function normalizeDomain(domain: string): string {
  // Stub implementation
  return domain.toLowerCase();
}

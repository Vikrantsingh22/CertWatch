import { WhoisResult } from '@certwatch/enrichment/src/types';

export interface RuleResult {
  points: number;
  reason: string | null;
}

export function domainAgeRule(whois: WhoisResult): RuleResult {
  // Stub implementation
  return { points: 0, reason: null };
}

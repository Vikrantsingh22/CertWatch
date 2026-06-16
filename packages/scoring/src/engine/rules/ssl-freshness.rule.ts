import { SslAsnResult } from '@certwatch/enrichment/src/types';
import { RuleResult } from './domain-age.rule';

export function sslFreshnessRule(ssl: SslAsnResult): RuleResult {
  // Stub implementation
  return { points: 0, reason: null };
}

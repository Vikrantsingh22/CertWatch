import { ContentResult } from '@certwatch/enrichment/src/types';
import { RuleResult } from './domain-age.rule';

export function contentRule(content: ContentResult): RuleResult {
  // Stub implementation
  return { points: 0, reason: null };
}

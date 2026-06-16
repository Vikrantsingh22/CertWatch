import { EnrichmentResult } from '@certwatch/enrichment/src/types';

export interface ScoringResult {
  score: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasons: string[];
}

export function scoreEnrichment(enrichment: EnrichmentResult): ScoringResult {
  // Stub implementation
  return {
    score: 0,
    riskLevel: 'LOW',
    reasons: [],
  };
}

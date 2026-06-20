import { Counter, Histogram, Registry } from 'prom-client';

export const register = new Registry();

export const rdapDomainsDone = new Counter({
  name: 'sentinel_enrichment_rdap_total',
  help: 'RDAP lookups completed',
  labelNames: ['status'], // 'success' | 'error' | 'timeout'
  registers: [register],
});

export const dnsDomainsDone = new Counter({
  name: 'sentinel_enrichment_dns_total',
  help: 'DNS lookups completed',
  labelNames: ['status'],
  registers: [register],
});

export const asnLookupsDone = new Counter({
  name: 'sentinel_enrichment_asn_total',
  help: 'ASN lookups completed',
  labelNames: ['flagged'], // 'true' | 'false'
  registers: [register],
});

export const enrichmentDuration = new Histogram({
  name: 'sentinel_enrichment_duration_ms',
  help: 'Per-worker enrichment duration in ms',
  labelNames: ['worker'],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000],
  registers: [register],
});

export const coordinatorPushed = new Counter({
  name: 'sentinel_enrichment_coordinator_pushed_total',
  help: 'Domains pushed to scoring-queue by coordinator',
  registers: [register],
});
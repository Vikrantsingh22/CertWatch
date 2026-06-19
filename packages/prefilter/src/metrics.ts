import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const register = new Registry();

export const domainsReceived = new Counter({
  name: 'sentinel_prefilter_domains_received_total',
  help: 'Total domains received from raw-domains queue',
  registers: [register],
});

export const domainsDropped = new Counter({
  name: 'sentinel_prefilter_domains_dropped_total',
  help: 'Domains dropped (no brand match)',
  registers: [register],
});

export const domainsPassed = new Counter({
  name: 'sentinel_prefilter_domains_passed_total',
  help: 'Domains passed to enrichment queue',
  labelNames: ['match_reason'], // 'similarity' | 'token_match' | 'keyword_combo'
  registers: [register],
});

export const processingDuration = new Histogram({
  name: 'sentinel_prefilter_processing_duration_ms',
  help: 'Time to process one domain in ms',
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [register],
});

export const queueDepth = new Gauge({
  name: 'sentinel_prefilter_enrichment_queue_depth',
  help: 'Current depth of enrichment queue',
  registers: [register],
});
import { Counter, Registry } from 'prom-client';

const register = new Registry();

const whoisEnriched = new Counter({
  name: 'whois_enriched_total',
  help: 'Total WHOIS enrichments completed',
  registers: [register],
});

const dnsEnriched = new Counter({
  name: 'dns_enriched_total',
  help: 'Total DNS enrichments completed',
  registers: [register],
});

const sslEnriched = new Counter({
  name: 'ssl_enriched_total',
  help: 'Total SSL/ASN enrichments completed',
  registers: [register],
});

const contentEnriched = new Counter({
  name: 'content_enriched_total',
  help: 'Total content enrichments completed',
  registers: [register],
});

export { whoisEnriched, dnsEnriched, sslEnriched, contentEnriched, register };

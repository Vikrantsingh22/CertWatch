import { Counter, Registry } from 'prom-client';

const register = new Registry();

const domainsIngested = new Counter({
  name: 'domains_ingested_total',
  help: 'Total number of domains ingested from CertStream',
  registers: [register],
});

const domainsDropped = new Counter({
  name: 'domains_dropped_total',
  help: 'Total number of domains dropped due to deduplication',
  registers: [register],
});

export { domainsIngested, domainsDropped, register };

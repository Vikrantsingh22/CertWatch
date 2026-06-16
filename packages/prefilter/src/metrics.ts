import { Counter, Registry } from 'prom-client';

const register = new Registry();

const domainsFiltered = new Counter({
  name: 'domains_filtered_total',
  help: 'Total number of domains that passed prefilter',
  registers: [register],
});

const domainsRejected = new Counter({
  name: 'domains_rejected_total',
  help: 'Total number of domains rejected by prefilter',
  registers: [register],
});

export { domainsFiltered, domainsRejected, register };

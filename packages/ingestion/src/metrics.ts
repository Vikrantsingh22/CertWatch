import { Counter, Gauge, Registry } from 'prom-client';

export const register = new Registry();

// Total domains seen from CertStream (before dedup)
export const domainsIngested = new Counter({
  name: 'sentinel_ingestion_domains_total',
  help: 'Total domains received from CertStream',
  registers: [register],
});

// Domains dropped by deduplicator
export const domainsDropped = new Counter({
  name: 'sentinel_ingestion_domains_deduped_total',
  help: 'Domains dropped by deduplication',
  registers: [register],
});

// Domains successfully pushed to raw-domains queue
export const domainsQueued = new Counter({
  name: 'sentinel_ingestion_domains_queued_total',
  help: 'Domains pushed onto raw-domains BullMQ queue',
  registers: [register],
});


// Pre-certs filtered out (ctlPoisonByte = true)
export const precertsFiltered = new Counter({
  name: 'sentinel_ingestion_precerts_filtered_total',
  help: 'Pre-certificate events filtered out',
  registers: [register],
});

// Current websocket connection state: 1 = connected, 0 = disconnected
export const wsConnectionStatus = new Gauge({
  name: 'sentinel_ingestion_ws_connected',
  help: 'WebSocket connection status (1=connected, 0=disconnected)',
  registers: [register],
});


// Current BullMQ queue depth (set this periodically)
export const queueDepth = new Gauge({
  name: 'sentinel_ingestion_queue_depth',
  help: 'Current depth of raw-domains BullMQ queue',
  registers: [register],
});





















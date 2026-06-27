// index.ts
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import http from 'http';
import { loadAsnDatabase } from './lib/asn-lookup';
import { EnrichmentCoordinator } from './coordinator';
import { startDispatcherWorker } from './workers/dispatcher.worker';
import { startWhoisWorker } from './workers/whois.worker';
import { startDnsWorker } from './workers/dns.worker';
import { startSslAsnWorker } from './workers/ssl-asn.worker';
import { register } from './metrics';
import { loadAsnBlocklist } from './lib/asn-blocklist';
import { loadRdapBootstrap, refreshBootstrapIfStale } from './lib/rdap-router';

dotenv.config();

async function main() {
  // Load databases before starting any workers
  const cacheRedis = new Redis(process.env.REDIS_URL!);
  await Promise.all([
    loadAsnDatabase(),
    loadAsnBlocklist(),
    loadRdapBootstrap(cacheRedis),
  ]);

  // Refresh RDAP bootstrap every 6h
  setInterval(() => refreshBootstrapIfStale(cacheRedis), 6 * 60 * 60 * 1000);

  // ── Redis connections ─────────────────────────────────────────────────────
  // BullMQ requirement: dedicated ioredis instance per worker and per queue.
  // Never share a connection between a Worker and a Queue.
  const makeWorkerRedis = () => new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const makeQueueRedis = () => new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // ── Typed sub-queues (fan-out targets) ────────────────────────────────────
  // The dispatcher reads enrichment-queue and writes one job to each of these.
  // Each typed queue feeds exactly one worker → coordinator gets exactly 3 results.
  const subQueueOpts = {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail:     { age: 86400 },
    },
  };
  const whoisQueue  = new Queue('whois-queue',   { connection: makeQueueRedis(), ...subQueueOpts });
  const dnsQueue    = new Queue('dns-queue',     { connection: makeQueueRedis(), ...subQueueOpts });
  const sslAsnQueue = new Queue('ssl-asn-queue', { connection: makeQueueRedis(), ...subQueueOpts });

  // ── Scoring queue (coordinator output) ────────────────────────────────────
  const scoringQueue = new Queue('scoring-queue', {
    connection: makeQueueRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail:     { age: 86400 },
    },
  });

  // ── Coordinator ───────────────────────────────────────────────────────────
  // requiredCount: 3 → waits for whois + dns + ssl_asn before pushing to scoring
  const coordinator = new EnrichmentCoordinator(
    new Redis(process.env.REDIS_URL!), // dedicated connection, no BullMQ flags needed
    scoringQueue,
    3,
  );

  // ── Workers ───────────────────────────────────────────────────────────────
  // Dispatcher: enrichment-queue → whois-queue + dns-queue + ssl-asn-queue
  const dispatcherWorker = startDispatcherWorker(
    makeWorkerRedis(),
    whoisQueue,
    dnsQueue,
    sslAsnQueue,
  );

  // Typed workers: each listens only to its own queue
  const whoisWorker  = startWhoisWorker(makeWorkerRedis(), coordinator);
  const dnsWorker    = startDnsWorker(makeWorkerRedis(), coordinator);
  const sslAsnWorker = startSslAsnWorker(makeWorkerRedis(), coordinator);
  // const contentWorker = startContentWorker(makeWorkerRedis(), coordinator); // add when ready

  // ── Metrics HTTP server ───────────────────────────────────────────────────
  const metricsPort = parseInt(process.env.ENRICHMENT_PROMETHEUS_PORT ?? '9093');
  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else {
      res.writeHead(404).end();
    }
  });
  metricsServer.listen(metricsPort, () =>
    console.log(`[Metrics] Enrichment metrics at :${metricsPort}/metrics`),
  );

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    console.log('[Enrichment] Shutting down...');
    await Promise.all([
      dispatcherWorker.close(),
      whoisWorker.close(),
      dnsWorker.close(),
      sslAsnWorker.close(),
    ]);
    await Promise.all([
      whoisQueue.close(),
      dnsQueue.close(),
      sslAsnQueue.close(),
      scoringQueue.close(),
    ]);
    cacheRedis.disconnect();
    metricsServer.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[Enrichment] Fatal:', err);
  process.exit(1);
});

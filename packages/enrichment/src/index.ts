import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import http from 'http';
import { loadAsnDatabase } from './lib/asn-lookup';
import { EnrichmentCoordinator } from './coordinator';
import { startWhoisWorker } from './workers/whois.worker';
import { startDnsWorker } from './workers/dns.worker';
import { startSslAsnWorker } from './workers/ssl-asn.worker';
import { register } from './metrics';
import {loadAsnBlocklist} from './lib/asn-blocklist';
import { loadRdapBootstrap } from './lib/rdap-router';

dotenv.config();

async function main() {

  // Load databases before starting any workers
  await Promise.all([
    loadAsnDatabase(),        // IP2ASN TSV → memory
    loadAsnBlocklist(),       // Spamhaus ASN-DROP → memory
    loadRdapBootstrap(),      // IANA RDAP bootstrap → memory
  ]);


  // Redis connections
  // One per worker (BullMQ requirement) + one for coordinator + one for scoring queue
  const makeWorkerRedis = () => new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const coordinatorRedis = new Redis(process.env.REDIS_URL!);
  const scoringQueueRedis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // Scoring queue (producer)
  const scoringQueue = new Queue('scoring-queue', {
    connection: scoringQueueRedis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    },
  });

  // Coordinator — require 3 workers (skip content for now, add when ready)
  const coordinator = new EnrichmentCoordinator(coordinatorRedis, scoringQueue, 3);

  // Start workers
  const whoisWorker  = startWhoisWorker(makeWorkerRedis(), coordinator);
  const dnsWorker    = startDnsWorker(makeWorkerRedis(), coordinator);
  const sslAsnWorker = startSslAsnWorker(makeWorkerRedis(), coordinator);
  // startContentWorker(makeWorkerRedis(), coordinator); // uncomment when ready

  // Metrics HTTP server
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
    console.log(`[Metrics] Enrichment metrics at :${metricsPort}/metrics`)
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Enrichment] Shutting down...');
    await Promise.all([whoisWorker.close(), dnsWorker.close(), sslAsnWorker.close()]);
    await scoringQueue.close();
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
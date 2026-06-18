import http from 'http';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { CertStreamClient } from './certstream.client';
import { Deduplicator } from './deduplicator';
import { register, queueDepth } from './metrics';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL!;
const CERTSTREAM_URL = process.env.CERTSTREAM_URL || 'wss://certstream.calidog.io';
const PROMETHEUS_PORT = parseInt(process.env.PROMETHEUS_PORT || '9091');
const DEDUP_WINDOW = parseInt(process.env.DEDUP_WINDOW_SECONDS || '60');

async function main() {
  // Redis connection for deduplication
  const dedupRedis = new Redis(REDIS_URL);
  dedupRedis.on('error', (err) => console.error('[Redis/dedup]', err.message));

  // Separate Redis connection for BullMQ (required)
  const bullRedis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // BullMQ queue
  const rawDomainsQueue = new Queue('raw-domains', {
    connection: bullRedis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });

  // Deduplicator
  const deduplicator = new Deduplicator(dedupRedis, DEDUP_WINDOW);

  // CertStream client
  const client = new CertStreamClient(CERTSTREAM_URL, rawDomainsQueue, deduplicator);

  // Metrics HTTP server (Prometheus scrapes this)
  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else if (req.url === '/health') {
      res.writeHead(200);
      res.end('ok');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  metricsServer.listen(PROMETHEUS_PORT, () => {
    console.log(`[Metrics] Prometheus metrics available at :${PROMETHEUS_PORT}/metrics`);
  });

  // Update queue depth metric every 10 seconds
  setInterval(async () => {
    try {
      const waiting = await rawDomainsQueue.getWaitingCount();
      queueDepth.set(waiting);
    } catch {
      // non-fatal
    }
  }, 10_000);

  // Start the CertStream connection
  client.connect();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Ingestion] Shutting down...');
    client.disconnect();
    await rawDomainsQueue.close();
    await deduplicator.close();
    await bullRedis.quit();
    metricsServer.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Ingestion] Shutting down (SIGINT)...');
    client.disconnect();
    await rawDomainsQueue.close();
    await deduplicator.close();
    await bullRedis.quit();
    metricsServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Ingestion] Fatal error:', err);
  process.exit(1);
});

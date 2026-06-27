import http from 'http';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { PreFilterWorker } from './worker';
import { WatchlistService } from './watchlist.service';
import { register, queueDepth } from './metrics';
import { Queue } from 'bullmq';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL!;
const PROMETHEUS_PORT = parseInt(process.env.PREFILTER_PROMETHEUS_PORT || '9092');

async function main() {
  // Three separate Redis connections:
  // 1. Watchlist (regular commands)
  const watchlistRedis = new Redis(REDIS_URL);

  // 2. BullMQ worker connection (consumes raw-domains)
  const workerRedis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // 3. BullMQ producer connection (pushes to enrichment-queue)
  const producerRedis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const dedupRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

  // Init watchlist (seeds Redis if empty)
  const watchlist = new WatchlistService(watchlistRedis);
  await watchlist.init();

  // Start worker
  const worker = new PreFilterWorker(workerRedis, producerRedis, watchlist, dedupRedis);
  await worker.start();

  // Queue depth gauge (monitor enrichment queue)
  const enrichmentQueue = new Queue('enrichment-queue', {
    connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
  });

  setInterval(async () => {
    try {
      const depth = await enrichmentQueue.getWaitingCount();
      queueDepth.set(depth);
    } catch { /* non-fatal */ }
  }, 10_000);

  // Prometheus metrics server
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
    console.log(`[Metrics] Prometheus available at :${PROMETHEUS_PORT}/metrics`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[PreFilter] Shutting down...');
    await worker.close();
    await watchlistRedis.quit();
    metricsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[PreFilter] Fatal:', err);
  process.exit(1);
});
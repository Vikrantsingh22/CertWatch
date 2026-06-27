import { Worker, Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Dispatcher Worker
 *
 * Consumes one job from enrichment-queue and fans it out to three
 * typed sub-queues: whois-queue, dns-queue, ssl-asn-queue.
 *
 * This is the fan-out layer that makes the coordinator pattern work.
 * Without it, all three workers compete for the same job (competing-consumer
 * semantics) and only ONE worker ever processes each domain, so the
 * coordinator never reaches 3/3.
 *
 * The prefilter and coordinator are NOT touched — this is a pure plumbing fix.
 */
export function startDispatcherWorker(
  workerRedis: Redis,
  whoisQueue: Queue,
  dnsQueue: Queue,
  sslAsnQueue: Queue,
): Worker {
  const worker = new Worker(
    'enrichment-queue',
    async (job: Job) => {
      const fqdn: string = job.data.fqdn ?? job.data.domain;

      // Fan-out: add one job to each typed sub-queue
      // jobId is keyed on fqdn to prevent BullMQ-level duplicates
      // if a stale job somehow slips through the prefilter dedup

      console.log(`cert issued at: ${job.data.certIssuedAt}, issuer CA: ${job.data.issuerCa}`);
      const jobOpts = {
        jobId: `${fqdn}:${job.data.certIssuedAt ?? Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 1000 },
        removeOnComplete: { age: 3600 },
        removeOnFail:     { age: 86400 },
      };

      await Promise.all([
        whoisQueue.add('whois',   job.data, jobOpts),
        dnsQueue.add('dns',       job.data, jobOpts),
        sslAsnQueue.add('ssl_asn', job.data, jobOpts),
      ]);

      console.log(`[Dispatcher] ${fqdn} → fanned out to whois/dns/ssl-asn queues`);
    },
    {
      connection: workerRedis,
      concurrency: 100, // dispatcher is fast — just Redis writes, high concurrency is fine
    },
  );

  worker.on('error',   (err)        => console.error('[Dispatcher] Worker error:', err));
  worker.on('stalled', (jobId)      => console.warn('[Dispatcher] Job stalled:', jobId));
  worker.on('failed',  (job, err)   => console.error(`[Dispatcher] Job failed: ${job?.data?.fqdn ?? job?.data?.domain}`, err.message));

  console.log('[Dispatcher Worker] Started — consuming enrichment-queue');
  return worker;
}

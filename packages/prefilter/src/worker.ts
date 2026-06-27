import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { normalizeDomain } from './normalizer';
import { checkSimilarity } from './similarity';
import { WatchlistService } from './watchlist.service';
import {
  domainsReceived, domainsDropped, domainsPassed, processingDuration
} from './metrics';

interface RawDomainJob {
  domain: string;
  source: string;
  firstSeenAt: string;
  certIssuedAt: number;
  issuerCa: string;
}

export class PreFilterWorker {
  private worker: Worker;
  private enrichmentQueue: Queue;
  private watchlist: WatchlistService;
  private dedupRedis: Redis; // dedicated instance for dedup SET NX calls

  constructor(
    workerRedis: Redis,
    producerRedis: Redis,
    watchlist: WatchlistService,
    dedupRedis: Redis,       // ← add this param
  ) {
    this.watchlist = watchlist;
    this.dedupRedis = dedupRedis;

    this.enrichmentQueue = new Queue('enrichment-queue', {
      connection: producerRedis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400 },
      },
    });

    this.worker = new Worker(
      'raw-domains',
      async (job) => {
        await this.processJob(job.data as RawDomainJob);
      },
      {
        connection: workerRedis,
        concurrency: 50,
      }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[PreFilter] Job failed: ${job?.data?.domain}`, err.message);
    });
  }

  private async processJob(data: RawDomainJob): Promise<void> {
    const start = Date.now();
    domainsReceived.inc();

    // Step 1: Normalize
    const normalized = normalizeDomain(data.domain);
    if (!normalized) {
      domainsDropped.inc();
      return;
    }

    if (normalized.domainWithoutTld.length < 4) {
      domainsDropped.inc();
      return;
    }

    // Step 2: Load watchlist
    const brands = await this.watchlist.getBrands();
    const legitMap = this.watchlist.getLegitDomainMap();

    // Step 3: Check similarity
    const result = checkSimilarity(
      normalized.normalized,
      normalized.tokens,
      brands,
      normalized.registrable,
    );

    processingDuration.observe(Date.now() - start);

    if (!result.matched) {
      domainsDropped.inc();
      return;
    }

    // Step 4: Strip www. to get canonical FQDN
    // www.apple-pharmacy.jp and apple-pharmacy.jp are the same domain
    // Always enqueue under the apex — enrichment workers don't need the www. variant
    const fqdn = data.domain.replace(/^www\./, '');
    const registrable = normalized.registrable;

    // Step 5: Dedup gate — 5 min window prevents duplicate enrichment jobs
    // Certstream emits the same cert multiple times (different CT logs log the same cert)
    // Without this gate, each emission creates a separate enrichment job
    const dedupKey = `prefilter:enqueued:${registrable}`;
    const isNew = await this.dedupRedis.set(dedupKey, '1', 'EX', 300, 'NX');
    if (!isNew) {
      console.log(`[PreFilter] SKIP duplicate ${data.domain} → ${registrable} (seen in last 5min)`);
      domainsDropped.inc();
      return;
    }

    // Step 6: Push to enrichment queue using canonical fqdn (no www.)
    domainsPassed.inc({ match_reason: result.matchReason! });
    console.log(
      `[PreFilter] PASS ${fqdn} → score: ${result.score.toFixed(2)} ` +
      `brand: ${result.brand} reason: ${result.matchReason}` +
      (result.keyword ? ` keyword: ${result.keyword}` : '')
    );

    await this.enrichmentQueue.add('enrich', {
      ...data,
      fqdn:registrable,                           // canonical domain, no www. — workers use this
      targetBrand: result.brand,
      similarityScore: result.score,
      matchReason: result.matchReason,
      suspiciousKeyword: result.keyword,
      normalizedDomain: normalized.normalized,
      domainTokens: normalized.tokens,
    });
  }

  async start(): Promise<void> {
    console.log('[PreFilter] Worker started, consuming raw-domains queue');
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.enrichmentQueue.close();
  }
}
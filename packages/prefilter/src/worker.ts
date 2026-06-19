import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { normalizeDomain } from './normalizer';
import { checkSimilarity } from './similarity';
import { WatchlistService } from './watchlist.service';
import {
  domainsReceived, domainsDropped, domainsPassed, processingDuration
} from './metrics';

// Job payload from ingestion
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

  constructor(
    workerRedis: Redis,
    producerRedis: Redis,
    watchlist: WatchlistService,
  ) {
    this.watchlist = watchlist;

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
        concurrency: 50, // process 50 domains simultaneously — they're CPU-bound not IO-bound
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

    // Step 2: Load watchlist (cached, reloads every 60s)
    const brands = await this.watchlist.getBrands();
    const brandNames = brands.map(b => b.brand);
    const legitMap = this.watchlist.getLegitDomainMap();

    // Step 3: Check similarity
    const result = checkSimilarity(
      normalized.normalized,
      normalized.tokens,
      brandNames,
      legitMap,
      normalized.registrable,
    );

    processingDuration.observe(Date.now() - start);

    if (!result.matched) {
      domainsDropped.inc();
      return;
    }

    // Step 4: Push to enrichment queue
    domainsPassed.inc({ match_reason: result.matchReason! });

    console.log(
      `[PreFilter] PASS ${data.domain} → score: ${result.score.toFixed(2)} ` +
      `brand: ${result.brand} reason: ${result.matchReason}` +
      (result.keyword ? ` keyword: ${result.keyword}` : '')
    );

    await this.enrichmentQueue.add('enrich', {
      ...data,                        // carry forward all ingestion data
      targetBrand: result.brand,      // which brand is being impersonated
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
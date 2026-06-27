import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

// Keys per domain — all expire in 1 hour
const hashKey  = (fqdn: string) => `enrichment:data:${fqdn}`;
const countKey = (fqdn: string) => `enrichment:count:${fqdn}`;
const TTL = 3600; // seconds

// Atomic increment + set TTL in one round-trip
// Returns new count — only the caller that gets back exactly requiredCount triggers scoring
const INCR_AND_CHECK = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return count
`;

export type WorkerType = 'whois' | 'dns' | 'ssl_asn' | 'content';

export class EnrichmentCoordinator {
  constructor(
    private redis: Redis,
    private scoringQueue: Queue,
    private requiredCount: number = 3, // 3 = skip content, 4 = all workers
  ) {}

  // Called by each worker after successfully enriching a domain
  async submit(
    fqdn: string,
    workerType: WorkerType,
    result: object,
    originalJob: object,
  ): Promise<void> {
    const hKey = hashKey(fqdn);
    const cKey = countKey(fqdn);

    // Write this worker's result into the hash
    await this.redis.hset(hKey, workerType, JSON.stringify(result));
    await this.redis.expire(hKey, TTL);

    // Atomic increment — only ONE caller will ever get back exactly requiredCount
    // count > requiredCount means a duplicate job arrived — ignore it
    const count = await this.redis.eval(INCR_AND_CHECK, 1, cKey, TTL) as number;

    console.log(`[Coordinator] ${fqdn} — ${workerType} done (${count}/${this.requiredCount})`);

    if (count === this.requiredCount) {
      await this.pushToScoring(fqdn, hKey, cKey, originalJob);
    }
  }

  // Called when a worker fails/times out — still increments so pipeline doesn't stall
  // Domain proceeds to scoring with null for the failed worker's data
  async submitFailure(
    fqdn: string,
    workerType: WorkerType,
    originalJob: object,
  ): Promise<void> {
    const hKey = hashKey(fqdn);
    const cKey = countKey(fqdn);

    // Write null so hash has the key but signals no data
    await this.redis.hset(hKey, workerType, JSON.stringify(null));
    await this.redis.expire(hKey, TTL);

    // Same atomic increment — === not >= to prevent duplicate pushes
    const count = await this.redis.eval(INCR_AND_CHECK, 1, cKey, TTL) as number;

    console.log(`[Coordinator] ${fqdn} — ${workerType} FAILED (${count}/${this.requiredCount})`);

    if (count === this.requiredCount) {
      await this.pushToScoring(fqdn, hKey, cKey, originalJob, true);
    }
  }

  // Shared push logic — called by both submit() and submitFailure()
  private async pushToScoring(
    fqdn: string,
    hKey: string,
    cKey: string,
    originalJob: object,
    hadFailures = false,
  ): Promise<void> {
    const raw = await this.redis.hgetall(hKey);

    const merged = {
      ...originalJob,
      whois:   raw.whois   ? JSON.parse(raw.whois)   : null,
      dns:     raw.dns     ? JSON.parse(raw.dns)     : null,
      sslAsn:  raw.ssl_asn ? JSON.parse(raw.ssl_asn) : null,
      content: raw.content ? JSON.parse(raw.content) : null,
    };

    await this.scoringQueue.add('score', merged, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail:     { age: 86400 },
    });

    // Clean up coordinator keys — domain is done
    await this.redis.del(hKey, cKey);

    const suffix = hadFailures ? ' (with failures)' : '';
    console.log(`[Coordinator] ${fqdn} → pushed to scoring-queue${suffix}`);
  }
}
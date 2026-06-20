import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

// Keys per domain — all expire in 1 hour
const hashKey  = (fqdn: string) => `enrichment:data:${fqdn}`;
const countKey = (fqdn: string) => `enrichment:count:${fqdn}`;
const TTL = 3600; // seconds

export type WorkerType = 'whois' | 'dns' | 'ssl_asn' | 'content';

export class EnrichmentCoordinator {
  constructor(
    private redis: Redis,
    private scoringQueue: Queue,
    private requiredCount: number = 3, // 3 = skip content, 4 = all workers
  ) {}

  // Called by each worker after it finishes enriching a domain
  async submit(
    fqdn: string,
    workerType: WorkerType,
    result: object,
    originalJob: object, // full job payload from enrichment-queue
  ): Promise<void> {
    const hKey = hashKey(fqdn);
    const cKey = countKey(fqdn);

    // Write this worker's result into the hash
    await this.redis.hset(hKey, workerType, JSON.stringify(result));
    await this.redis.expire(hKey, TTL);

    // Increment completion counter
    const count = await this.redis.incr(cKey);
    await this.redis.expire(cKey, TTL);

    console.log(`[Coordinator] ${fqdn} — ${workerType} done (${count}/${this.requiredCount})`);

    if (count >= this.requiredCount) {
      // All required workers done — read full hash and push to scoring
      const raw = await this.redis.hgetall(hKey);
      const merged = {
        ...originalJob,
        whois:   raw.whois    ? JSON.parse(raw.whois)   : null,
        dns:     raw.dns      ? JSON.parse(raw.dns)     : null,
        sslAsn:  raw.ssl_asn  ? JSON.parse(raw.ssl_asn) : null,
        content: raw.content  ? JSON.parse(raw.content) : null,
      };

      await this.scoringQueue.add('score', merged, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      });

      // Clean up coordinator keys
      await this.redis.del(hKey, cKey);
      console.log(`[Coordinator] ${fqdn} → pushed to scoring-queue`);
    }
  }

  // Called when a worker fails/times out — still count it so pipeline doesn't stall
  async submitFailure(
    fqdn: string,
    workerType: WorkerType,
    originalJob: object,
  ): Promise<void> {
    // Write a null result so the hash has the key but no data
    await this.redis.hset(hashKey(fqdn), workerType, JSON.stringify(null));
    await this.redis.expire(hashKey(fqdn), TTL);
    await this.submit(fqdn, workerType, {}, originalJob); // increments counter
  }
}
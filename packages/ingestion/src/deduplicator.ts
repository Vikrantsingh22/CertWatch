import { Redis } from 'ioredis';

export class Deduplicator {
  private redis: Redis;
  private windowSeconds: number;

  constructor(redis: Redis, windowSeconds: number = 60) {
    this.redis = redis;
    this.windowSeconds = windowSeconds;
  }

  // Returns true if this domain was already seen within the window
  // Returns false if this is a new domain (and marks it as seen)
  async isDuplicate(domain: string): Promise<boolean> { 
    const key = `dedup:${domain}`;
    // SET key 1 NX EX <ttl>
    // NX = only set if key does NOT exist
    // Returns "OK" if set (new domain), null if already existed (duplicate)
    const result = await this.redis.set(key, '1', 'EX', this.windowSeconds, 'NX');
    return result === null; // null means key already existed = duplicate
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
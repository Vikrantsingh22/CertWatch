import { Redis } from 'ioredis';
import { BRAND_WATCHLIST } from './watchlist.data';

const WATCHLIST_KEY = 'sentinel:watchlist';

export interface BrandEntry {
  brand: string;
  legitDomains: string[];
}

export class WatchlistService {
  private redis: Redis;
  private cachedBrands: BrandEntry[] = [];
  private legitDomainMap: Map<string, string[]> = new Map();
  private lastLoaded: number = 0;
  private cacheTtlMs: number = 60_000; // reload from Redis every 60s

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async init(): Promise<void> {
    // Seed Redis with static watchlist on startup if not already seeded
    const existing = await this.redis.exists(WATCHLIST_KEY);
    if (!existing) {
      const pipeline = this.redis.pipeline();
      for (const entry of BRAND_WATCHLIST) {
        pipeline.hset(WATCHLIST_KEY, entry.brand, JSON.stringify(entry.legitDomains));
      }
      await pipeline.exec();
      console.log(`[Watchlist] Seeded ${BRAND_WATCHLIST.length} brands to Redis`);
    }
    await this.reload();
  }

  async getBrands(): Promise<BrandEntry[]> {
    // Return cached unless stale
    if (Date.now() - this.lastLoaded > this.cacheTtlMs) {
      await this.reload();
    }
    return this.cachedBrands;
  }

  getLegitDomainMap(): Map<string, string[]> {
    return this.legitDomainMap;
  }

  private async reload(): Promise<void> {
    const raw = await this.redis.hgetall(WATCHLIST_KEY);
    this.cachedBrands = Object.entries(raw).map(([brand, legit]) => ({
      brand,
      legitDomains: JSON.parse(legit),
    }));
    this.legitDomainMap = new Map(
      this.cachedBrands.map(e => [e.brand, e.legitDomains])
    );
    this.lastLoaded = Date.now();
  }
}
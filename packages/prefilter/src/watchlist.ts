import Redis from 'ioredis';

export class WatchlistService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
  }

  async getBrands(): Promise<string[]> {
    // Stub implementation
    return Promise.resolve([]);
  }

  isFlaggedDomain(domain: string): boolean {
    // Stub implementation
    return false;
  }
}

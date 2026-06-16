import Redis from 'ioredis';

export class Deduplicator {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
  }

  async isDuplicate(domain: string): Promise<boolean> {
    // Stub implementation
    return Promise.resolve(false);
  }
}

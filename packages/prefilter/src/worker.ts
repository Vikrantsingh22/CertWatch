import { Queue, QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';

// Use a SEPARATE ioredis connection for BullMQ
// BullMQ requires its own connection
// ioredis instance used for deduplication
const bullConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,   
  enableReadyCheck: false,      
});

const rawDomainsQueue = new Queue('raw-domains', {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,               // prefilter will retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 1000,             // 1s, 2s, 4s
    },
    removeOnComplete: {
      age: 3600,               // keep completed jobs for 1 hour (for debugging)
      count: 1000,             // keep last 1000 completed jobs max
    },
    removeOnFail: {
      age: 86400,              // keep failed jobs for 24 hours
    },
  },
});

// Job payload shape pushed onto the queue
interface RawDomainJob {
  domain: string;
  source: string;           // "certstream"
  firstSeenAt: string;      // ISO timestamp
  certIssuedAt: number;     // unix timestamp from not_before
  issuerCa: string;         // "Let's Encrypt", "ZeroSSL" etc
}
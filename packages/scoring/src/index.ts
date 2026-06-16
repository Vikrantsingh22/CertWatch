import * as dotenv from 'dotenv';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

dotenv.config();

async function main() {
  const redis = new Redis({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  const queue = new Queue('scoring-jobs', { connection: redis });
  const worker = new Worker(
    'scoring-jobs',
    async (job) => {
      // Stub implementation
    },
    { connection: redis }
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

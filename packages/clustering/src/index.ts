import * as dotenv from 'dotenv';
import { ClusteringScheduler } from './scheduler';

dotenv.config();

async function main() {
  const scheduler = new ClusteringScheduler();
  await scheduler.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

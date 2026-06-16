import * as dotenv from 'dotenv';
import { PreFilterWorker } from './worker';

dotenv.config();

async function main() {
  const worker = new PreFilterWorker();
  await worker.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

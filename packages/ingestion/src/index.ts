import * as dotenv from 'dotenv';
import { CertStreamClient } from './certstream.client';

dotenv.config();

async function main() {
  console.log('Ingestion service starting');
  
  const client = new CertStreamClient();
  await client.connect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import * as dotenv from 'dotenv';
import { WhoisWorker } from './workers/whois.worker';
import { DnsWorker } from './workers/dns.worker';
import { SslAsnWorker } from './workers/ssl-asn.worker';
import { ContentWorker } from './workers/content.worker';

dotenv.config();

async function main() {
  const workers = [
    new WhoisWorker(),
    new DnsWorker(),
    new SslAsnWorker(),
    new ContentWorker(),
  ];

  for (const worker of workers) {
    await worker.start();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

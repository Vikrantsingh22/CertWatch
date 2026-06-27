import { setTimeout as sleep } from 'timers/promises';
// Parking providers route their domains to these IPs
// A domain pointing here = registered but not yet active = staged attack
const PARKING_IPS = new Set([
  // GoDaddy parking
  '34.102.136.180', '34.98.99.30',
  // Sedo parking
  '195.201.94.115', '81.169.145.105',
  // Namecheap parking
  '198.54.117.197', '198.54.117.198',
  // Uniregistry/GoDaddy
  '184.168.131.241', '184.168.221.96',
  // Generic parking aggregators
  '67.227.220.212', '64.90.40.162',
  // Bodis parking
  '103.224.212.222',
]);

// CIDR ranges for parking (check if IP falls in range)
const PARKING_CIDRS = [
  { start: ip2int('34.98.0.0'),   end: ip2int('34.98.255.255')  }, // Google Cloud parking pool
  { start: ip2int('205.178.0.0'), end: ip2int('205.178.255.255') }, // Network Solutions
];

function ip2int(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

function isParkedIp(ip: string): boolean {
  if (PARKING_IPS.has(ip)) return true;
  const ipInt = ip2int(ip);
  return PARKING_CIDRS.some(range => ipInt >= range.start && ipInt <= range.end);
}


import dns from 'dns/promises';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EnrichmentCoordinator } from '../coordinator';

export interface DnsResult {
  resolvedIp: string | null;
  nameservers: string[];
  mxPresent: boolean;
  isParked: boolean;
  isNxDomain: boolean; // domain doesn't exist in DNS yet — staged/not yet deployed
}

async function resolveDomain(fqdn: string): Promise<DnsResult> {
  let resolvedIp: string | null = null;
  let nameservers: string[] = [];
  let mxPresent = false;
  let isNxDomain = false;
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, sleep(ms).then(() => { throw new Error('timeout'); })]);
  // Run A, NS, MX lookups in parallel — don't let one block others
  const [aResult, nsResult, mxResult] = await Promise.allSettled([
    withTimeout(dns.resolve4(fqdn),   3000),
    withTimeout(dns.resolveNs(fqdn),  3000),
    withTimeout(dns.resolveMx(fqdn),  3000),
  ]);

  if (aResult.status === 'fulfilled' && aResult.value.length > 0) {
    resolvedIp = aResult.value[0]; // take first A record
  } else if (aResult.status === 'rejected') {
    const code = (aResult.reason as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') isNxDomain = true;
    // ETIMEDOUT, ESERVFAIL etc. — treat as temporarily unresolvable
  }

  if (nsResult.status === 'fulfilled') {
    nameservers = nsResult.value;
  }

  if (mxResult.status === 'fulfilled' && mxResult.value.length > 0) {
    mxPresent = true;
  }

  const isParked = resolvedIp ? isParkedIp(resolvedIp) : false;

  return { resolvedIp, nameservers, mxPresent, isParked, isNxDomain };
}

export function startDnsWorker(
  workerRedis: Redis,
  coordinator: EnrichmentCoordinator,
): Worker {
  const worker = new Worker(
    'dns-queue',
    async (job: Job) => {
      const fqdn: string = job.data.fqdn ?? job.data.domain;
      try {
        const result = await resolveDomain(fqdn);
        console.log(`[DNS] resolved ${fqdn}:`);
        await coordinator.submit(fqdn, 'dns', result, job.data);
      } catch (err: any) {
        console.error(`[DNS] Failed for ${fqdn}: ${err.message}`);
        await coordinator.submitFailure(fqdn, 'dns', job.data);
      }
    },
    {
      connection: workerRedis,
      concurrency: 50, // DNS is fast IO — high concurrency fine
    }

  );

  
  worker.on('error',   (err)   => console.error('[DNS] Worker error:', err));
  worker.on('stalled', (jobId) => console.warn('[DNS] Job stalled:', jobId));
  worker.on('failed',  (job, err) => console.error(`[DNS] Job failed: ${job?.data?.fqdn ?? job?.data?.domain}`, err.message));

  console.log('[DNS Worker] Started');
  return worker;
}
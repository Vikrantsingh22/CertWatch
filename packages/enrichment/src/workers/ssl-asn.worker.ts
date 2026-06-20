import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import dns from 'dns/promises';
import { EnrichmentCoordinator } from '../coordinator';
import { lookupAsn, FLAGGED_ASNS, PARTIAL_FLAGGED_ASNS } from '../lib/asn-lookup';

export interface SslAsnResult {
  certIssuedAt: string;       // ISO string — from job.data.certIssuedAt
  issuerCa: string;           // from job.data.issuerCa
  asn: string | null;
  asnOrg: string | null;
  asnCountry: string | null;
  asnFlagged: boolean;
  asnPartialFlag: boolean;    // major cloud provider — lower risk weight
}

export function startSslAsnWorker(
  workerRedis: Redis,
  coordinator: EnrichmentCoordinator,
): Worker {
  const worker = new Worker(
    'enrichment-queue',
    async (job: Job) => {
      const fqdn: string = job.data.domain;

      try {
        // Cert data already in the job payload — no HTTP call needed
        const certIssuedAt = new Date(job.data.certIssuedAt * 1000).toISOString();
        const issuerCa = job.data.issuerCa ?? 'unknown';

        // Try to get IP: check if DNS worker already wrote its result
        let ip: string | null = null;
        const dnsRaw = await workerRedis.hget(`enrichment:data:${fqdn}`, 'dns');
        if (dnsRaw) {
          const dnsResult = JSON.parse(dnsRaw);
          ip = dnsResult.resolvedIp;
        } else {
          // DNS worker hasn't finished yet — do our own quick A record lookup
          try {
            const addresses = await dns.resolve4(fqdn);
            ip = addresses[0] ?? null;
          } catch { /* domain doesn't resolve */ }
        }

        let asn: string | null = null;
        let asnOrg: string | null = null;
        let asnCountry: string | null = null;
        let asnFlagged = false;
        let asnPartialFlag = false;

        if (ip) {
          const asnRecord = lookupAsn(ip);
          if (asnRecord) {
            asn = asnRecord.asn;
            asnOrg = asnRecord.org;
            asnCountry = asnRecord.country;
            asnFlagged = FLAGGED_ASNS.has(asn);
            asnPartialFlag = PARTIAL_FLAGGED_ASNS.has(asn);
          }
        }

        const result: SslAsnResult = {
          certIssuedAt, issuerCa,
          asn, asnOrg, asnCountry,
          asnFlagged, asnPartialFlag,
        };

        await coordinator.submit(fqdn, 'ssl_asn', result, job.data);
      } catch (err: any) {
        console.error(`[SSL/ASN] Failed for ${fqdn}: ${err.message}`);
        await coordinator.submitFailure(fqdn, 'ssl_asn', job.data);
      }
    },
    { connection: workerRedis, concurrency: 20 }
  );

  console.log('[SSL/ASN Worker] Started');
  return worker;
}
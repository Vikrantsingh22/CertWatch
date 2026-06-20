const RDAP_ENDPOINTS: Record<string, string> = {
  'com':  'https://rdap.verisign.com/com/v1/domain',
  'net':  'https://rdap.verisign.com/net/v1/domain',
  'org':  'https://rdap.publicinterest.registry/rdap/domain',
  'in':   'https://www.registry.in/rdap/domain',
  'io':   'https://rdap.iana.org/domain',
  'co':   'https://rdap.iana.org/domain',
  'info': 'https://rdap.afilias.info/rdap/domain',
  'biz':  'https://rdap.nic.biz/domain',
};
const RDAP_FALLBACK = 'https://rdap.org/domain';

function getRdapUrl(domain: string, tld: string): string {
  const base = RDAP_ENDPOINTS[tld] ?? RDAP_FALLBACK;
  return `${base}/${domain}`;
}


import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EnrichmentCoordinator } from '../coordinator';
import { rdapDomainsDone } from '../metrics';

export interface WhoisResult {
  domainAgeHours: number | null;  // null if RDAP lookup failed
  registrar: string | null;
  privacyProtected: boolean;
  registrantCountry: string | null;
  registrationDate: string | null; // ISO string, for scoring engine
}

export async function lookupRdap(domain: string, tld: string): Promise<WhoisResult> {
  const url = getRdapUrl(domain, tld);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'CertWatch/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // 404 = domain not found in RDAP (newly registered, RDAP not yet propagated)
      // Treat as: very new domain, privacy unknown
      if (res.status === 404) {
        return {
          domainAgeHours: 0, // treat as brand new
          registrar: null,
          privacyProtected: false,
          registrantCountry: null,
          registrationDate: null,
        };
      }
      throw new Error(`RDAP HTTP ${res.status}`);
    }

    const data = await res.json();
    return parseRdapResponse(data);

  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('RDAP timeout');
    throw err;
  }
}

function parseRdapResponse(data: any): WhoisResult {
  // RDAP events array contains registrationDate, expirationDate, etc.
  const events: Array<{ eventAction: string; eventDate: string }> = data.events ?? [];
  const regEvent = events.find(e => e.eventAction === 'registration');
  const registrationDate = regEvent?.eventDate ?? null;

  const domainAgeHours = registrationDate
    ? (Date.now() - new Date(registrationDate).getTime()) / 3_600_000
    : null;

  // RDAP entities: registrant, registrar, etc.
  const entities: any[] = data.entities ?? [];

  // Find registrar entity
  const registrarEntity = entities.find((e: any) =>
    e.roles?.includes('registrar')
  );
  const registrar = registrarEntity?.vcardArray?.[1]
    ?.find((v: any[]) => v[0] === 'fn')?.[3] ?? null;

  // Find registrant entity
  const registrantEntity = entities.find((e: any) =>
    e.roles?.includes('registrant')
  );

  // Privacy protection: registrant entity is redacted if privacy is on
  // RDAP marks redacted fields with "remarks" containing "redacted"
  // OR the registrant vcard fn value is a generic privacy service name
  const privacyKeywords = ['whoisguard', 'privacy', 'redacted', 'withheld', 'protected'];
  const registrantName: string = registrantEntity?.vcardArray?.[1]
    ?.find((v: any[]) => v[0] === 'fn')?.[3]?.toLowerCase() ?? '';
  const privacyProtected = !registrantEntity ||
    privacyKeywords.some(kw => registrantName.includes(kw)) ||
    (data.remarks ?? []).some((r: any) =>
      r.description?.some((d: string) => d.toLowerCase().includes('redact'))
    );

  // Country: from registrant vcard adr field
  const registrantCountry: string | null = registrantEntity?.vcardArray?.[1]
    ?.find((v: any[]) => v[0] === 'adr')?.[1]?.['country-name'] ?? null;

  return {
    domainAgeHours,
    registrar,
    privacyProtected,
    registrantCountry,
    registrationDate,
  };
}

export function startWhoisWorker(
  workerRedis: Redis,
  coordinator: EnrichmentCoordinator,
): Worker {
  const worker = new Worker(
    'enrichment-queue',
    async (job: Job) => {
      const { domain, tld, ...rest } = job.data;

      // Use tld from normalizer output (passed in prefilter job payload)
      const fqdn: string = job.data.domain;
      const domainTld: string = job.data.tld ?? fqdn.split('.').pop() ?? 'com';

      try {
        const result = await lookupRdap(fqdn, domainTld);
        rdapDomainsDone.inc({ status: 'success' });
        await coordinator.submit(fqdn, 'whois', result, job.data);
      } catch (err: any) {
        console.error(`[WHOIS] Failed for ${fqdn}: ${err.message}`);
        rdapDomainsDone.inc({ status: 'error' });
        // Don't let one worker failure stall the whole pipeline
        await coordinator.submitFailure(fqdn, 'whois', job.data);
      }
    },
    {
      connection: workerRedis,
      concurrency: 15, // RDAP is IO-bound — high concurrency is fine
      // IMPORTANT: use a unique name so it only processes its own jobs
      // All 4 workers share the same queue — they each pick up ALL jobs
      // This is correct — each worker independently enriches the same domain
    },
  );

  worker.on('failed', (job, err) =>
    console.error(`[WHOIS] Job error: ${job?.data?.domain}`, err.message)
  );

  console.log('[WHOIS Worker] Started');
  return worker;
}
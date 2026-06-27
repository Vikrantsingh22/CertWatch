import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EnrichmentCoordinator } from '../coordinator';
import { rdapDomainsDone } from '../metrics';
import { getRdapUrl } from '../lib/rdap-router';
import { parse } from 'tldts';

export interface WhoisResult {
  domainAgeHours: number | null;  // null if RDAP lookup failed
  registrar: string | null;
  privacyProtected: boolean;
  registrantCountry: string | null;
  registrationDate: string | null; // ISO string, for scoring engine
}

export async function lookupRdap(fqdn: string): Promise<WhoisResult> {
  const parsed = parse(fqdn);
  const registrable = parsed.domain ?? fqdn;
  const tld = registrable.split('.').pop()?.toLowerCase() ?? '';
  const SKIP_RDAP_TLDS = new Set(['ph', 'su', 'cn', 'ru', 'tk', 'ml', 'ga', 'cf', 'gq']);
  if (SKIP_RDAP_TLDS.has(tld)) {
    console.log(`[WHOIS] Skipping RDAP for .${tld} (known slow/blocking) — ${registrable}`);
    return { domainAgeHours: null, registrar: null, privacyProtected: false, registrantCountry: null, registrationDate: null };
  }
  const url = getRdapUrl(registrable);
  console.log(`[WHOIS] RDAP lookup for ${registrable} at ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

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
      if (res.status === 400) {
        // Queried a subdomain or malformed domain — shouldn't happen after fix 2
        // but handle gracefully as a safety net
        console.warn(`[WHOIS] RDAP 400 for ${registrable} — subdomain query rejected`);
        return { domainAgeHours: null, registrar: null, privacyProtected: false, registrantCountry: null, registrationDate: null };
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

export function startWhoisWorker(workerRedis: Redis, coordinator: EnrichmentCoordinator): Worker {
  const worker = new Worker(
    'whois-queue',
    async (job: Job) => {
      const fqdn: string = job.data.fqdn ?? job.data.domain;

      try {
        const result = await lookupRdap(fqdn);
        rdapDomainsDone.inc({ status: 'success' });
        console.log(`[WHOIS] submitted for ${fqdn}`);
        await coordinator.submit(fqdn, 'whois', result, job.data);
      } catch (err: any) {
        console.error(`[WHOIS] Failed for ${fqdn}: ${err.message}`);
        rdapDomainsDone.inc({ status: 'error' });
        await coordinator.submitFailure(fqdn, 'whois', job.data);
      }
    },
    { connection: workerRedis, concurrency: 40 },
  );

  worker.on('error',   (err)        => console.error('[WHOIS] Worker error:', err));
  worker.on('stalled', (jobId)      => console.warn('[WHOIS] Job stalled:', jobId));
  worker.on('failed',  (job, err)   => console.error(`[WHOIS] Job failed: ${job?.data?.fqdn ?? job?.data?.domain}`, err.message));

  console.log('[WHOIS Worker] Started');
  return worker;
}
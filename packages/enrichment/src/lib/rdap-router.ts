// src/lib/rdap-router.ts
import { Redis } from 'ioredis';
export interface BootstrapEntry {
  tlds: string[];
  urls: string[];
}

export let bootstrapMap = new Map<string, string>(); // tld → rdap base URL
let bootstrapLoaded = false;
let lastLoadedAt = 0;
const BOOTSTRAP_TTL_SEC = 6 * 60 * 60;         
const BOOTSTRAP_TTL_MS  = BOOTSTRAP_TTL_SEC * 1000;

export async function loadRdapBootstrap(redis?: Redis): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    if (redis) {
      const cached = await redis.get('rdap:bootstrap').catch(() => null);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, string>;
        bootstrapMap = new Map(Object.entries(parsed));
        bootstrapLoaded = true;
        lastLoadedAt = Date.now();
        console.log(`[RDAP Router] Loaded ${bootstrapMap.size} TLD mappings from Redis cache`);
        return;
      }
    }

    const res = await fetch('https://data.iana.org/rdap/dns.json', {
      headers: { 'User-Agent': 'CertWatch/1.0' },
      signal: controller.signal,
    });
    const data = await res.json();

    const newMap = new Map<string, string>();
    for (const [tlds, urls] of data.services) {
      for (const tld of tlds) {
        newMap.set(tld.toLowerCase(), urls[0]);
      }
    }

    // 1. Populate map
    bootstrapMap = newMap;

    // 2. Write to Redis (fail open — .catch swallows error intentionally)
    if (redis) {
      const obj = Object.fromEntries(bootstrapMap);
      await redis.set('rdap:bootstrap', JSON.stringify(obj), 'EX', BOOTSTRAP_TTL_SEC)
        .catch(err => console.warn('[RDAP Router] Redis cache write failed:', err.message));
    }

    // 3. Mark loaded only after map is populated and Redis write attempted
    bootstrapLoaded = true;
    lastLoadedAt = Date.now();
    console.log(`[RDAP Router] Loaded ${bootstrapMap.size} TLD mappings from IANA`);

  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[RDAP Router] Bootstrap fetch timed out — rdap.org fallback active');
    } else {
      console.error('[RDAP Router] Failed to load bootstrap:', err.message);
    }
    // bootstrapLoaded stays false — getRdapUrl falls back to rdap.org for all TLDs
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshBootstrapIfStale(redis?: Redis): Promise<void> {
  if (Date.now() - lastLoadedAt < BOOTSTRAP_TTL_MS) return;
  console.log('[RDAP Router] Bootstrap stale, refreshing from IANA...');
  if (redis) await redis.del('rdap:bootstrap').catch(() => null);
  await loadRdapBootstrap(redis);
}

export function getRdapUrl(fqdn: string): string {
  if (!bootstrapLoaded) {
    console.warn('[RDAP Router] Bootstrap not loaded — using rdap.org fallback');
    return `https://rdap.org/domain/${fqdn}`;
  }

  const tld = fqdn.split('.').pop()?.toLowerCase() ?? '';
  const base = bootstrapMap.get(tld);

  if (base) {
    return `${base.replace(/\/$/, '')}/domain/${fqdn}`;
  }
  return `https://rdap.org/domain/${fqdn}`;
}

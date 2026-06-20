// src/lib/rdap-router.ts

export interface BootstrapEntry {
  tlds: string[];
  urls: string[];
}

export let bootstrapMap = new Map<string, string>(); // tld → rdap base URL
let bootstrapLoaded = false;

export async function loadRdapBootstrap(): Promise<void> {
  try {
    const res = await fetch('https://data.iana.org/rdap/dns.json', {
      headers: { 'User-Agent': 'CertWatch/1.0' }
    });
    const data = await res.json();

    bootstrapMap.clear();
    for (const [tlds, urls] of data.services) {
      const url = urls[0]; // take first URL (primary endpoint)
      for (const tld of tlds) {
        bootstrapMap.set(tld.toLowerCase(), url);
      }
    }
    bootstrapLoaded = true;
    console.log(`[RDAP Router] Loaded ${bootstrapMap.size} TLD mappings from IANA`);
  } catch (err) {
    console.error('[RDAP Router] Failed to load bootstrap, will use rdap.org fallback:', err);
  }
}

export function getRdapUrl(fqdn: string, tld: string): string {
  const base = bootstrapMap.get(tld.toLowerCase());
  if (base) {
    // Ensure trailing slash then append "domain/<fqdn>"
    return `${base.replace(/\/$/, '')}/domain/${fqdn}`;
  }
  // Fallback to rdap.org for unknown TLDs
  return `https://rdap.org/domain/${fqdn}`;
}
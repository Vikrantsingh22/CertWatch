const SPAMHAUS_ASN_DROP = 'https://www.spamhaus.org/drop/asndrop.json';

let flaggedAsns = new Set<string>();
let lastFetched = 0;

export async function loadAsnBlocklist(): Promise<void> {
  try {
    const res = await fetch(SPAMHAUS_ASN_DROP, {
      headers: { 'User-Agent': 'CertWatch/1.0 (research project)' }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }    
    const text = await res.text();

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const asns = new Set<string>();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        // skip metadata object
        if (obj.type === 'metadata') continue;

        if (obj.asn) {
          asns.add(`AS${obj.asn}`);
        }
      } catch (err) {
        console.warn(
          '[ASN Blocklist] Failed to parse line:',
          line
        );
      }
    }

    flaggedAsns = asns;
    lastFetched = Date.now();
    console.log(`[ASN Blocklist] Loaded ${flaggedAsns.size} flagged ASNs from Spamhaus`);
  } catch (err) {
    console.error('[ASN Blocklist] Failed to load Spamhaus list, using empty set:', err);
    // Non-fatal — system still works, just won't flag ASNs
  }
}

// Refresh every 24 hours
export async function refreshIfStale(): Promise<void> {
  if (Date.now() - lastFetched > 24 * 3600 * 1000) {
    await loadAsnBlocklist();
  }
}

export function isAsnFlagged(asn: string): boolean {
  return flaggedAsns.has(asn);
}
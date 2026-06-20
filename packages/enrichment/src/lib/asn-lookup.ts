import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream , existsSync, readFileSync} from 'fs';
import { join } from 'path';

interface AsnRecord {
  startInt: number;
  endInt: number;
  asn: string;
  country: string;
  org: string;
}

function ip2int(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

let asnTable: AsnRecord[] = [];

export async function loadAsnDatabase(): Promise<void> {
  const tsvPath = join(process.cwd(), 'data', 'ip2asn-v4.tsv');

  // Download if not present
  if (!existsSync(tsvPath)) {
    console.log('[ASN] Downloading IP2ASN database...');
    const res = await fetch('https://iptoasn.com/data/ip2asn-v4.tsv.gz');
    const gzPath = tsvPath + '.gz';
    await pipeline(res.body as any, createWriteStream(gzPath));
    await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(tsvPath));
    console.log('[ASN] Download complete');
  }

  // Parse TSV: startIP \t endIP \t ASN \t country \t org
  const content = readFileSync(tsvPath, 'utf-8');
  asnTable = content
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [start, end, asn, country, org] = line.split('\t');
      return {
        startInt: ip2int(start),
        endInt: ip2int(end),
        asn: `AS${asn}`,
        country,
        org: org?.trim() ?? '',
      };
    })
    .filter(r => !isNaN(r.startInt) && !isNaN(r.endInt));

  console.log(`[ASN] Loaded ${asnTable.length} IP ranges`);
}

// Binary search O(log n) — much faster than linear scan on 400k+ records
export function lookupAsn(ip: string): { asn: string; org: string; country: string } | null {
  const ipInt = ip2int(ip);
  let lo = 0, hi = asnTable.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const record = asnTable[mid];
    if (ipInt < record.startInt) {
      hi = mid - 1;
    } else if (ipInt > record.endInt) {
      lo = mid + 1;
    } else {
      return { asn: record.asn, org: record.org, country: record.country };
    }
  }
  return null;
}


// These ASNs are consistently flagged across multiple threat intel sources
// for hosting phishing, malware C2, and spam infrastructure
export const FLAGGED_ASNS = new Set([
  'AS9009',   // M247 Ltd — massive bulletproof hosting, top phishing ASN
  'AS49870',  // Alsycon — bulletproof hosting Netherlands
  'AS206728', // Mediafield Ltd — phishing infrastructure
  'AS62282',  // BL Networks — bulletproof
  'AS399629', // BLNWX — known for phishing campaigns
  'AS61317',  // Digital Energy Technologies — phishing
  'AS35624',  // Ukrtelegroup — bulletproof Ukraine
  'AS204428', // SS-Net — phishing/spam
  'AS59642',  // Lir.am — bulletproof Armenia
  'AS58061',  // Nice IT Services — Pakistan bulletproof
  'AS133877', // Nexeon Technologies — SEA bulletproof
  'AS49453',  // Global Layer — NL bulletproof
  'AS204915', // Serverius — NL hosting, high abuse rate
  'AS48721',  // Flyservers — hosting phishing kits
  'AS34665',  // Petersburg Internet Network — Russia bulletproof
  'AS200019', // Alexhost — Moldova bulletproof
  'AS51659',  // Wirelesswan-AS — phishing infrastructure
  'AS60781',  // LeaseWeb Netherlands — high abuse volume
  'AS47583',  // Hostinger International — commonly abused shared hosting
  'AS16509',  // Amazon AWS — not bulletproof, but FLAGGING this helps catch
              // cheap AWS-hosted phishing (score lower than true bulletproof)
]);

// ASNs that are commonly abused but not exclusively — partial flag
export const PARTIAL_FLAGGED_ASNS = new Set([
  'AS16509',  // AWS
  'AS14618',  // AWS
  'AS15169',  // Google Cloud (phishers use free tier)
  'AS8075',   // Microsoft Azure
]);

export function isAsnFlagged(asn: string): boolean {
  return FLAGGED_ASNS.has(asn);
}
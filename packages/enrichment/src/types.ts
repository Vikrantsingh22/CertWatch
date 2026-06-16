export interface WhoisResult {
  domainAgeHours: number;
  registrar: string;
  privacyProtected: boolean;
  registrantCountry: string | null;
}

export interface DnsResult {
  resolvedIp: string | null;
  nameservers: string[];
  mxPresent: boolean;
  isParked: boolean;
}

export interface SslAsnResult {
  certIssuedAt: Date;
  issuerCa: string;
  asn: string;
  asnOrg: string;
  asnFlagged: boolean;
}

export interface ContentResult {
  redirectChain: string[];
  screenshotPath: string | null;
  hasLoginForm: boolean;
  brandMentions: number;
  pageTitle: string | null;
}

export interface EnrichmentResult {
  domain: string;
  whois: WhoisResult;
  dns: DnsResult;
  sslAsn: SslAsnResult;
  content: ContentResult;
}

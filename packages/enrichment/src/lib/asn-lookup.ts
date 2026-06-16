export class AsnLookup {
  async loadDatabase(path: string): Promise<void> {
    // Stub implementation
    return Promise.resolve();
  }

  lookup(ip: string): { asn: string; org: string } | null {
    // Stub implementation
    return null;
  }
}

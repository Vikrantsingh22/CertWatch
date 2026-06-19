import WebSocket from 'ws';
import { Queue } from 'bullmq';
import { Deduplicator } from './deduplicator';
import {
  domainsIngested,
  domainsDropped,
  domainsQueued,
  precertsFiltered,
  wsConnectionStatus,
} from './metrics';

// Shape of the CertStream event we care about
interface CertStreamEvent {
  message_type: string;
  data: {
    update_type: string;          // "X509LogEntry" | "PrecertLogEntry"
    seen: number;                 // unix timestamp (float)
    leaf_cert: {
      all_domains: string[];      // ["*.example.com", "example.com"]
      not_before: number;         // unix timestamp of cert issuance
      issuer: {
        O: string | null;         // "Let's Encrypt", "ZeroSSL" etc
      };
      extensions: {
        ctlPoisonByte?: boolean;  // true = pre-cert, skip it
      };
    };
    source: {
      name: string;
    };
  };
}

export class CertStreamClient {
  private ws: WebSocket | null = null;
  private url: string;
  private queue: Queue;
  private deduplicator: Deduplicator;
  private reconnectAttempts: number = 0;
  private maxReconnectDelay: number = 30000; // 30 seconds max backoff
  private isShuttingDown: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(url: string, queue: Queue, deduplicator: Deduplicator) {
    this.url = url;
    this.queue = queue;
    this.deduplicator = deduplicator;
  }

  connect(): void {
    if (this.isShuttingDown) return;

    console.log(`[CertStream] Connecting to ${this.url}...`);
    wsConnectionStatus.set(0);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[CertStream] Connected');
      wsConnectionStatus.set(1);
      this.reconnectAttempts = 0;

    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30_000);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      console.warn(`[CertStream] Disconnected: code=${code} reason=${reason.toString()}`);
      wsConnectionStatus.set(0);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      console.error('[CertStream] WebSocket error:', err.message);
      wsConnectionStatus.set(0);
      // 'close' event will fire after 'error', so reconnect is handled there
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let event: CertStreamEvent;

    try {
      event = JSON.parse(raw);
    } catch {
      return; // malformed JSON — silently drop
    }

    // Only process certificate_update messages
    if (event.message_type !== 'certificate_update') return;

    // Filter out pre-certificates (ctlPoisonByte = true)
    // These are preliminary submissions that will be duplicated by the final cert
    if (event.data.leaf_cert.extensions?.ctlPoisonByte === true) {
      precertsFiltered.inc();
      return;
    }

    // Also filter by update_type as a secondary check
    if (event.data.update_type !== 'X509LogEntry') {
      precertsFiltered.inc();
      return;
    }

    const domains = event.data.leaf_cert.all_domains;
    if (!domains || domains.length === 0) return;

    for (const rawDomain of domains) {
      // Strip wildcard prefix — "*.example.com" → "example.com"
      const domain = rawDomain.startsWith('*.') ? rawDomain.slice(2) : rawDomain;

      // Skip empty or obviously invalid
      if (!domain || !domain.includes('.')) continue;

      domainsIngested.inc();

      // Deduplication check
      const isDup = await this.deduplicator.isDuplicate(domain);
      if (isDup) {
        domainsDropped.inc();
        continue;
      }

      console.log(`[CertStream] New domain: ${domain} (source: ${event.data.source.name})`);
      // Push onto BullMQ raw-domains queue
      try {
        await this.queue.add('domain', {
          domain,
          source: 'certstream',
          firstSeenAt: new Date().toISOString(),
          certIssuedAt: event.data.leaf_cert.not_before,
          issuerCa: event.data.leaf_cert.issuer.O ?? 'unknown',
        });
        domainsQueued.inc();
      } catch (err) {
        console.error(`[CertStream] Failed to queue domain ${domain}:`, err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    // Exponential backoff with jitter
    // Attempt 0: ~1s, Attempt 1: ~2s, Attempt 2: ~4s ... capped at 30s
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    const jitter = Math.random() * 1000; // add up to 1s of random jitter
    const delay = base + jitter;

    this.reconnectAttempts++;
    console.log(`[CertStream] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    this.isShuttingDown = true;
    this.ws?.close();
    console.log('[CertStream] Disconnected gracefully');
  }
}

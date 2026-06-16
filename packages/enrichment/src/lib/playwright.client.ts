import { ContentResult } from '../types';

export class PlaywrightClient {
  async init(): Promise<void> {
    // Stub implementation
    return Promise.resolve();
  }

  async visitDomain(domain: string): Promise<ContentResult> {
    // Stub implementation
    return {
      redirectChain: [],
      screenshotPath: null,
      hasLoginForm: false,
      brandMentions: 0,
      pageTitle: null,
    };
  }

  async close(): Promise<void> {
    // Stub implementation
    return Promise.resolve();
  }
}

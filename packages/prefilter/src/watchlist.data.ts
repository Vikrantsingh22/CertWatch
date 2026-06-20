export const BRAND_WATCHLIST = [
  // ── Global ──────────────────────────────────────────────────────────────
  { brand: 'amazon', legitDomains: [
    'amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de',
    'amazon.dev', 'amazonaws.com', 'aws.amazon.com',
    'amazonpay.in', 'amazonpay.com',
  ]},
  { brand: 'google', legitDomains: [
    'google.com', 'google.co.in', 'googleapis.com',
    'googlevideo.com', 'gstatic.com', 'googleusercontent.com', 'google.dev',
  ]},
  { brand: 'microsoft', legitDomains: [
    'microsoft.com', 'live.com', 'outlook.com',
    'azure.com', 'azurewebsites.net', 'microsoftonline.com',
    'windows.net', 'office.com', 'office365.com',
  ]},
  { brand: 'apple', legitDomains: [
    'apple.com', 'icloud.com', 'me.com',
    'appleid.apple.com', 'developer.apple.com',
  ]},
  { brand: 'microsoftonline', legitDomains: [
  'microsoftonline.com', 'login.microsoftonline.com',
  ]},
  { brand: 'facebook',  legitDomains: ['facebook.com', 'fb.com', 'meta.com'] },
  { brand: 'instagram', legitDomains: ['instagram.com'] },
  { brand: 'netflix',   legitDomains: ['netflix.com'] },
  { brand: 'paypal',    legitDomains: ['paypal.com'] },

  // ── Indian fintech ───────────────────────────────────────────────────────
  { brand: 'paytm',   legitDomains: ['paytm.com', 'paytm.in'] },
  { brand: 'phonepe', legitDomains: ['phonepe.com'] },
  { brand: 'gpay',    legitDomains: ['pay.google.com'] },
  { brand: 'razorpay',legitDomains: ['razorpay.com'] },
  { brand: 'zerodha', legitDomains: ['zerodha.com'] },
  { brand: 'groww',   legitDomains: ['groww.in'] },
  { brand: 'cred',    legitDomains: ['cred.club'] },

  // ── Indian banks ─────────────────────────────────────────────────────────
  // Short aliases go BEFORE the long form so Tier 1 catches hdfc/axis/icici tokens
  { brand: 'hdfc',  legitDomains: ['hdfcbank.com', 'hdfcbank.in', 'hdfc.com'] },
  { brand: 'axis',  legitDomains: ['axisbank.com', 'axisbank.in'] },
  { brand: 'icici', legitDomains: ['icicibank.com', 'icicilombard.com', 'iciciprulife.com'] },
  { brand: 'sbi',   legitDomains: ['sbi.co.in', 'onlinesbi.com'] },

  // Long forms — catch hdfcbank.com in the domain body directly
  { brand: 'hdfcbank', legitDomains: ['hdfcbank.com', 'hdfcbank.in', 'hdfc.com'] },
  { brand: 'icicibank',legitDomains: ['icicibank.com', 'icicilombard.com'] },
  { brand: 'axisbank', legitDomains: ['axisbank.com', 'axisbank.in'] },
];

export const SUSPICIOUS_KEYWORDS = [
  'secure', 'security', 'verify', 'verification',
  'login', 'signin', 'sign-in', 'auth', 'authenticate',
  'wallet', 'account', 'support', 'helpdesk', 'help',
  'update', 'confirm', 'validation', 'kyc',
  'payment', 'pay', 'billing', 'invoice',
  'alert', 'notice', 'recover', 'recovery',
  'official', 'customer', 'service',
];
//this is static seed. Later the API will add more at runtime via Redis.
export const BRAND_WATCHLIST = [
  // Indian fintech (primary focus — realistic for your location + demo)
  { brand: 'paytm',    legitDomains: ['paytm.com', 'paytm.in'] },
  { brand: 'phonepe',  legitDomains: ['phonepe.com'] },
  { brand: 'gpay',     legitDomains: ['pay.google.com'] },
  { brand: 'razorpay', legitDomains: ['razorpay.com'] },
  { brand: 'zerodha',  legitDomains: ['zerodha.com'] },
  { brand: 'groww',    legitDomains: ['groww.in'] },
  { brand: 'cred',     legitDomains: ['cred.club'] },

  // Indian banks
  { brand: 'hdfcbank', legitDomains: ['hdfcbank.com', 'hdfc.com'] },
  { brand: 'sbi',      legitDomains: ['sbi.co.in', 'onlinesbi.com'] },
  { brand: 'icicibank',legitDomains: ['icicibank.com'] },
  { brand: 'axisbank', legitDomains: ['axisbank.com'] },

  // Global (for campaign volume — phishers target these heavily)
  { brand: 'google',   legitDomains: ['google.com', 'google.co.in'] },
  { brand: 'microsoft',legitDomains: ['microsoft.com', 'live.com', 'outlook.com'] },
  { brand: 'apple',    legitDomains: ['apple.com', 'icloud.com'] },
  { brand: 'amazon',   legitDomains: ['amazon.in', 'amazon.com', 'aws.amazon.com'] },
  { brand: 'facebook', legitDomains: ['facebook.com', 'fb.com', 'meta.com'] },
  { brand: 'instagram',legitDomains: ['instagram.com'] },
  { brand: 'netflix',  legitDomains: ['netflix.com'] },
  { brand: 'paypal',   legitDomains: ['paypal.com'] },
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
// src/config.ts

export interface RetryConfig {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface AppConfig {
  defaultRpcEndpoints: readonly string[];
  heliusRpcUrl?: string; // Optional dedicated RPC URL
  rpcRequestTimeoutMs: number;
  signatureFetchLimit: number;
  retry: {
    getSignatures: RetryConfig;
    getTransaction: RetryConfig;
  };
}

const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

// Attempt to load Helius RPC URL from environment variable
// For a real application, you'd use a .env file and a library like dotenv for local development
const HELIUS_API_KEY = process.env.HELIUS_API_KEY; // User would set this environment variable
const heliusRpcUrlFromEnv = HELIUS_API_KEY ? `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}` : undefined;

export const config: AppConfig = {
  // Prioritize Helius if the API key is provided via environment variable
  defaultRpcEndpoints: [
    // If you have a Helius API key set as an environment variable, it could be dynamically added here.
    // For submission, we'll keep it illustrative.
    // 'https://rpc.helius.xyz/?api-key=YOUR_HELIUS_API_KEY_HERE', // Example: Replace with actual or manage via ENV
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://api.rpcpool.com',
  ] as const,

  // You can also make it so heliusRpcUrl is explicitly checked first by the app if defined
  heliusRpcUrl: heliusRpcUrlFromEnv, // This will be undefined if HELIUS_API_KEY is not set

  rpcRequestTimeoutMs: 30000,
  signatureFetchLimit: 1000,

  retry: {
    getSignatures: {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
    },
    getTransaction: {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
    },
  },
};

export function getEffectiveRpcEndpoints(customEndpoint?: string): readonly string[] {
  if (customEndpoint) {
    return [customEndpoint];
  }
  // If Helius URL is configured (e.g., via environment variable), prioritize it
  if (config.heliusRpcUrl) {
    return [config.heliusRpcUrl, ...config.defaultRpcEndpoints.filter(url => url !== config.heliusRpcUrl)];
  }
  return config.defaultRpcEndpoints;
}


export function getRetryDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  const delay = initialDelayMs * Math.pow(2, attempt);
  return Math.min(delay, maxDelayMs);
}

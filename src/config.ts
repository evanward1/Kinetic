// src/config.ts

export interface RetryConfig {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number; // Optional: to cap the exponential backoff
}

export interface AppConfig {
  defaultRpcEndpoints: readonly string[];
  rpcRequestTimeoutMs: number; // General timeout for RPC requests
  signatureFetchLimit: number;
  retry: {
    getSignatures: RetryConfig;
    getTransaction: RetryConfig;
  };
}

const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000; // Max delay for a single retry wait

export const config: AppConfig = {
  defaultRpcEndpoints: [
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://api.rpcpool.com',
    // Consider adding Helius as per original prompt if an API key is available/managed
    // 'https://rpc.helius.xyz/?api-key=YOUR_API_KEY_HERE'
  ] as const, // Use 'as const' for readonly array of specific strings

  rpcRequestTimeoutMs: 30000, // 30 seconds for a single RPC call attempt (not used by @solana/web3.js directly but good for custom fetch)

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

// Function to calculate exponential backoff delay
export function getRetryDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  const delay = initialDelayMs * Math.pow(2, attempt);
  return Math.min(delay, maxDelayMs);
}

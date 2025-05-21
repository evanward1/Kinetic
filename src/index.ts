#!/usr/bin/env node

import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  VersionedTransactionResponse,
  GetTransactionConfig,
  SignaturesForAddressOptions,
} from '@solana/web3.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface Args {
  programId: string;
  verbose: boolean;
  endpoint?: string;
}

// Exported for testing
export async function findFirstSignature(
  connection: Connection,
  programPubkey: PublicKey,
  verbose: boolean
): Promise<string> {
  const limit = 1000; // Max signatures per request
  let before: string | undefined = undefined;
  let earliestSig: string | undefined = undefined;
  let foundAllSignatures = false;
  let lastRpcError: any = null; // To store the last error from RPC

  if (verbose) console.log(`[LOG] Starting to fetch signatures for ${programPubkey.toBase58()} with limit ${limit}`);

  while (!foundAllSignatures) {
    let sigInfos: ConfirmedSignatureInfo[] = [];
    if (verbose) console.log(`[LOG] Fetching signatures before: ${before || 'most recent'}`);
    lastRpcError = null; // Reset for this batch attempt

    for (let attempt = 0; attempt < 5; attempt++) { // Retry mechanism
      try {
        const options: SignaturesForAddressOptions = { limit };
        if (before) {
          options.before = before;
        }
        sigInfos = await connection.getSignaturesForAddress(programPubkey, options);
        if (verbose) console.log(`[LOG] Fetched ${sigInfos.length} signature infos.`);
        lastRpcError = null; // Clear error on success
        break; // Success
      } catch (e: any) {
        lastRpcError = e; // Store the caught error
        if (e?.message?.includes('429')) { // Rate limit
          const delay = 500 * Math.pow(2, attempt);
          if (verbose) console.warn(`[WARN] Rate limit hit on getSignaturesForAddress. Retrying in ${delay}ms... (Attempt ${attempt + 1}/5)`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          if (verbose) console.error(`[ERROR] Failed to fetch signatures on attempt ${attempt + 1}: ${e.message}`);
          if (attempt === 4) throw e; // Re-throw on last attempt if not a 429
        }
      }
    }

    // If after retries, sigInfos is still empty AND there was an RPC error (like 429 for all retries)
    if (sigInfos.length === 0 && lastRpcError) {
        throw lastRpcError; // Re-throw the actual RPC error
    }

    if (sigInfos.length === 0) {
      if (earliestSig) { // If we had found signatures in a previous batch, this means we're done.
         foundAllSignatures = true;
      } else { // No signatures ever found for this program.
        throw new Error('No signatures found for this program. Signature fetch might have failed or the program has no transactions.');
      }
      break;
    }

    earliestSig = sigInfos[sigInfos.length - 1].signature;

    if (sigInfos.length < limit) {
      foundAllSignatures = true;
      if (verbose) console.log(`[LOG] Reached end of signature history, earliest in this batch: ${earliestSig}`);
    } else {
      before = earliestSig;
      if (verbose) console.log(`[LOG] Continuing pagination, next 'before' will be: ${before}`);
    }
  }

  if (!earliestSig) {
    // This condition is hit if the loop finishes without setting earliestSig.
    // If lastRpcError is present, it means all attempts for the first batch failed.
    if (lastRpcError) throw lastRpcError;
    // Otherwise, it's the generic "no signatures found" which might occur if loop exited due to `foundAllSignatures = true` but `earliestSig` was somehow not set (should be rare).
    throw new Error('No signatures found for this program after pagination attempts.');
  }

  if (verbose) console.log(`[LOG] Determined earliest signature: ${earliestSig}`);
  return earliestSig;
}

// Exported for testing
export async function fetchBlockTime(
  connection: Connection,
  signature: string,
  verbose: boolean
): Promise<number> {
  let tx: VersionedTransactionResponse | null = null;
  let lastRpcError: any = null; // To store the last error from RPC

  if (verbose) console.log(`[LOG] Fetching transaction details for signature: ${signature}`);

  for (let attempt = 0; attempt < 5; attempt++) { // Retry mechanism
    try {
      const config: GetTransactionConfig = {
        commitment: 'confirmed',
      };
      tx = await connection.getTransaction(signature, config);
      if (verbose && tx) console.log(`[LOG] Transaction details fetched. BlockTime: ${tx.blockTime}`);
      else if (verbose && !tx) console.log(`[LOG] Transaction not found or null response for signature: ${signature} on attempt ${attempt + 1}`);
      lastRpcError = null; // Clear error on success
      break; // Success
    } catch (e: any) {
      lastRpcError = e; // Store the caught error
      if (e?.message?.includes('429')) { // Rate limit
        const delay = 500 * Math.pow(2, attempt);
        if (verbose) console.warn(`[WARN] Rate limit hit on getTransaction. Retrying in ${delay}ms... (Attempt ${attempt + 1}/5)`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        if (verbose) console.error(`[ERROR] Failed to fetch transaction on attempt ${attempt + 1}: ${e.message}`);
        if (attempt === 4) throw e; // Re-throw on last attempt if not a 429
      }
    }
  }

  // If after retries, tx is still null AND there was an RPC error (like 429 for all retries)
  if (!tx && lastRpcError) {
    throw lastRpcError; // Re-throw the actual RPC error
  }

  if (!tx) {
    throw new Error(`Transaction fetch failed for signature ${signature} after max retries or transaction not found.`);
  }

  if (tx.blockTime === null || tx.blockTime === undefined) {
    throw new Error(`Block time is missing from the transaction for signature: ${signature}.`);
  }

  return tx.blockTime;
}

// Main CLI execution logic
async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <programId> [--verbose] [--endpoint url]')
    .command('$0 <programId>', 'Fetches the first deployment timestamp of a Solana program ID.')
    .positional('programId', {
      describe: 'Solana program ID to query',
      type: 'string',
      demandOption: true
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Enable verbose logging for debugging and detailed process information.',
      default: false
    })
    .option('endpoint', {
      alias: 'e',
      type: 'string',
      description: 'Specify a custom Solana RPC endpoint URL.'
    })
    .strict()
    .help()
    .alias('help', 'h')
    .wrap(yargs(hideBin(process.argv)).terminalWidth())
    .parseSync() as unknown as Args;

  const { programId, verbose, endpoint } = argv;

  if (verbose) {
    console.log('[LOG] CLI started with options:');
    console.log(`[LOG]   Program ID: ${programId}`);
    console.log(`[LOG]   Verbose: ${verbose}`);
    console.log(`[LOG]   Endpoint: ${endpoint || '(default list will be used)'}`);
  }

  const pubkey = (() => {
    try {
      return new PublicKey(programId);
    } catch (err: any) {
      console.error(`[ERROR] Invalid program ID: ${programId}. ${err.message}`);
      process.exit(1);
    }
  })();

  const defaultEndpoints = [
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://api.rpcpool.com',
  ];

  const endpointsToTry = endpoint ? [endpoint] : defaultEndpoints;
  let overallLastError: Error | null = null;

  for (const url of endpointsToTry) {
    if (verbose) console.log(`[LOG] Attempting to use RPC endpoint: ${url}`);
    const connection = new Connection(url, { commitment: 'confirmed' });

    try {
      const sig = await findFirstSignature(connection, pubkey, verbose);
      const blockTime = await fetchBlockTime(connection, sig, verbose);
      const deploymentDate = new Date(blockTime * 1000).toISOString();
      console.log(deploymentDate);
      process.exit(0);
    } catch (err: any) {
      overallLastError = err;
      if (verbose) {
        console.error(`[ERROR] Endpoint ${url} failed: ${err.message}`);
      }
    }
  }

  console.error(`[ERROR] All configured RPC endpoints failed to retrieve the deployment timestamp.`);
  if (overallLastError) {
    console.error(`[ERROR] Last error encountered: ${overallLastError.message}`);
  } else {
    console.error("[ERROR] No specific error message from last attempt, check logs if verbose mode was on.");
  }
  process.exit(1);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[FATAL_ERROR] An unexpected error occurred: ${err.message}`);
    process.exit(1);
  });
}

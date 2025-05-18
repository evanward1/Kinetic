#!/usr/bin/env node

import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  VersionedTransactionResponse
} from '@solana/web3.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface Args {
  programId: string;
  verbose: boolean;
  endpoint?: string;
}

async function findFirstSignature(
  connection: Connection,
  programPubkey: PublicKey,
  verbose: boolean
): Promise<string> {
  const limit = 1000;
  let before: string | undefined = undefined;
  let earliestSig: string | undefined = undefined;

  while (true) {
    let sigInfos: ConfirmedSignatureInfo[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        sigInfos = await connection.getSignaturesForAddress(programPubkey, { before, limit });
        break;
      } catch (e: any) {
        if (e?.message?.includes('429')) {
          const delay = 500 * Math.pow(2, attempt);
          if (verbose) console.warn(`[WARN] Rate limit hit. Retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          throw e;
        }
      }
    }

    if (sigInfos.length === 0) {
      throw new Error('Signature fetch failed after max retries.');
    }

    earliestSig = sigInfos[sigInfos.length - 1].signature;
    if (sigInfos.length < limit) break;
    before = earliestSig;
  }

  if (!earliestSig) {
    throw new Error('No signatures found for this program');
  }

  return earliestSig;
}

async function fetchBlockTime(
  connection: Connection,
  signature: string,
  verbose: boolean
): Promise<number> {
  let tx: VersionedTransactionResponse | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      break;
    } catch (e: any) {
      if (e?.message?.includes('429')) {
        const delay = 500 * Math.pow(2, attempt);
        if (verbose) console.warn(`[WARN] Rate limit hit on transaction fetch. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw e;
      }
    }
  }

  if (!tx) {
    throw new Error('Transaction fetch failed after max retries.');
  }

  if (tx.blockTime === null || tx.blockTime === undefined) {
    throw new Error('Block time is missing from the transaction.');
  }

  return tx.blockTime;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <programId> [--verbose] [--endpoint url]')
    .command('$0 <programId>', 'Solana program ID')
    .positional('programId', {
      describe: 'Solana program ID to query',
      type: 'string',
      demandOption: true
    })
    .option('verbose', {
      type: 'boolean',
      description: 'Enable verbose logging',
      default: false
    })
    .option('endpoint', {
      type: 'string',
      description: 'Solana RPC endpoint URL'
    })
    .strict()
    .help()
    .parseSync() as unknown as Args;

  const { programId, verbose, endpoint } = argv;
  const pubkey = (() => {
    try {
      return new PublicKey(programId);
    } catch (err: any) {
      console.error(`[ERROR] Invalid program ID: ${err.message}`);
      process.exit(1);
    }
  })();

  const endpoints = endpoint
    ? [endpoint]
    : [
        process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://api.rpcpool.com'
      ];

  let lastError: Error | null = null;
  for (const url of endpoints) {
    if (verbose) console.log(`[LOG] Trying endpoint ${url}`);
    const connection = new Connection(url, { commitment: 'confirmed' });

    try {
      const sig = await findFirstSignature(connection, pubkey, verbose);
      const blockTime = await fetchBlockTime(connection, sig, verbose);
      console.log(new Date(blockTime * 1000).toISOString());
      process.exit(0);
    } catch (err: any) {
      lastError = err;
      if (verbose) {
        console.error(`[ERROR] Endpoint ${url} failed: ${err.message}`);
      }
    }
  }

  console.error(`[ERROR] All endpoints failed${lastError ? `: ${lastError.message}` : ''}`);
  process.exit(1);
}

main().catch(err => {
  console.error(`[ERROR] Unexpected error: ${err.message}`);
  process.exit(1);
});

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
// Updated import to include getEffectiveRpcEndpoints
import { AppConfig, config, getRetryDelay, getEffectiveRpcEndpoints } from './config';
import logger from './logger';
import {
  NoSignaturesFoundError,
  TransactionNotFoundError,
  MissingBlockTimeError,
  RpcMaxRetriesError,
  InvalidProgramIdError,
  AppError,
} from './errors';

interface CliArgs {
  programId: string;
  verbose: boolean;
  endpoint?: string;
}

// Helper function for retrying async operations
async function retryOperation<T>(
  operationName: string,
  operationFn: () => Promise<T>,
  retryConfig: AppConfig['retry']['getSignatures']
): Promise<T> {
  let lastError: any = null;
  for (let attempt = 0; attempt < retryConfig.attempts; attempt++) {
    try {
      return await operationFn();
    } catch (e: any) {
      lastError = e;
      const delay = getRetryDelay(attempt, retryConfig.initialDelayMs, retryConfig.maxDelayMs);
      if (e?.message?.includes('429')) {
        logger.warn(`Rate limit hit on ${operationName}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${retryConfig.attempts})`);
      } else {
        logger.error(`Error during ${operationName} on attempt ${attempt + 1}: ${e.message || String(e)}`);
        logger.warn(`Retrying ${operationName} after error in ${delay}ms... (Attempt ${attempt + 1}/${retryConfig.attempts})`);
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
  const finalErrorMessage = (typeof lastError === 'object' && lastError !== null && 'message' in lastError) ? String(lastError.message) : String(lastError);
  const errorToWrapForFinalThrow = lastError instanceof Error ? lastError : new Error(finalErrorMessage);
  throw new RpcMaxRetriesError(operationName, errorToWrapForFinalThrow);
}

// Exported for testing
export async function findFirstSignature(
  connection: Connection,
  programPubkey: PublicKey
): Promise<string> {
  let before: string | undefined = undefined;
  let earliestSig: string | undefined = undefined;
  let foundAllSignatures = false;

  logger.log(`Starting to fetch signatures for ${programPubkey.toBase58()} with limit ${config.signatureFetchLimit}`);

  while (!foundAllSignatures) {
    logger.log(`Fetching signatures before: ${before || 'most recent'}`);
    
    const sigInfos = await retryOperation(
      'getSignaturesForAddress',
      async () => {
        const options: SignaturesForAddressOptions = { limit: config.signatureFetchLimit };
        if (before) {
          options.before = before;
        }
        return connection.getSignaturesForAddress(programPubkey, options);
      },
      config.retry.getSignatures
    );

    logger.log(`Fetched ${sigInfos.length} signature infos.`);

    if (sigInfos.length === 0) {
      if (earliestSig) {
        foundAllSignatures = true;
        break;
      } else {
        throw new NoSignaturesFoundError(programPubkey.toBase58());
      }
    }

    earliestSig = sigInfos[sigInfos.length - 1].signature;

    if (sigInfos.length < config.signatureFetchLimit) {
      foundAllSignatures = true;
      logger.log(`Reached end of signature history, earliest in this batch: ${earliestSig}`);
    } else {
      before = earliestSig;
      logger.log(`Continuing pagination, next 'before' will be: ${before}`);
    }
  }

  if (!earliestSig) {
    throw new NoSignaturesFoundError(programPubkey.toBase58(), 'Failed to determine earliest signature after pagination attempts.');
  }

  logger.log(`Determined earliest signature: ${earliestSig}`);
  return earliestSig;
}

// Exported for testing
export async function fetchBlockTime(
  connection: Connection,
  signature: string
): Promise<number> {
  logger.log(`Fetching transaction details for signature: ${signature}`);

  const tx = await retryOperation(
    'getTransaction',
    async () => {
      const txConfig: GetTransactionConfig = {
        commitment: 'confirmed',
      };
      const result = await connection.getTransaction(signature, txConfig);
      if (!result) {
        throw new TransactionNotFoundError(signature, `Transaction ${signature} not found by RPC node.`);
      }
      return result;
    },
    config.retry.getTransaction
  );

  logger.log(`Transaction details fetched. Slot: ${tx.slot}, BlockTime: ${tx.blockTime}`);

  if (tx.blockTime === null || tx.blockTime === undefined) {
    throw new MissingBlockTimeError(signature);
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
    .parseSync() as unknown as CliArgs;

  logger.initialize(argv.verbose);

  // Renamed endpoint from yargs to cliEndpoint for clarity
  const { programId, endpoint: cliEndpoint } = argv; 

  logger.log('CLI started with options:', { programId, verbose: argv.verbose, endpoint: cliEndpoint || '(effective list will be used)' });

  const pubkey = (() => {
    try {
      return new PublicKey(programId);
    } catch (err: any) {
      throw new InvalidProgramIdError(programId, err instanceof Error ? err : new Error(String(err)));
    }
  })();

  // Use getEffectiveRpcEndpoints to determine the list of URLs to try
  const endpointsToTry = getEffectiveRpcEndpoints(cliEndpoint);
  logger.log('Effective RPC endpoints to try:', endpointsToTry);


  let overallLastError: Error | null = null;

  for (const url of endpointsToTry) {
    logger.log(`Attempting to use RPC endpoint: ${url}`);
    const connection = new Connection(url, { commitment: 'confirmed' });

    try {
      const sig = await findFirstSignature(connection, pubkey);
      const blockTime = await fetchBlockTime(connection, sig);
      const deploymentDate = new Date(blockTime * 1000).toISOString();
      logger.printResult(deploymentDate);
      process.exit(0);
    } catch (err: any) {
      overallLastError = err;
      if (err instanceof AppError) {
        logger.error(`Endpoint ${url} failed: ${err.name} - ${err.message}`);
      } else {
        logger.error(`Endpoint ${url} failed with an unexpected error: ${err.message || String(err)}`);
      }
      if (argv.verbose && err.stack) {
        logger.debug('Stack trace:', err.stack);
      }
    }
  }

  logger.fatal('All configured RPC endpoints failed to retrieve the deployment timestamp.');
  if (overallLastError) {
    if (overallLastError instanceof AppError) {
        logger.error(`Last error encountered: ${overallLastError.name} - ${overallLastError.message}`);
    } else {
        logger.error(`Last error encountered: ${overallLastError.message || String(overallLastError)}`);
    }
    if (argv.verbose && overallLastError.stack) {
        logger.debug('Last error stack trace:', overallLastError.stack);
    }
  } else {
    logger.error("No specific error message from last attempt, check logs if verbose mode was on.");
  }
  process.exit(1); 
}

if (require.main === module) {
  main().catch(err => {
    if (err instanceof AppError) {
        console.error(`[FATAL] ${err.name}: ${err.message}`);
    } else {
        console.error(`[FATAL] An unexpected error occurred: ${err.message || String(err)}`);
    }
    // Optionally show stack in dev, but be careful in production
    if (process.env.NODE_ENV === 'development' && err.stack) { 
        console.error(err.stack);
    }
    process.exit(1);
  });
}

#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
async function findFirstSignature(connection, programPubkey, verbose) {
    var _a;
    const limit = 1000; // Max signatures per request
    let before = undefined;
    let earliestSig = undefined;
    let foundAllSignatures = false;
    if (verbose)
        console.log(`[LOG] Starting to fetch signatures for ${programPubkey.toBase58()} with limit ${limit}`);
    // This loop paginates backwards through the transaction history.
    // It continues as long as the API returns a full batch of `limit` signatures,
    // implying there might be older ones.
    while (!foundAllSignatures) {
        let sigInfos = [];
        if (verbose)
            console.log(`[LOG] Fetching signatures before: ${before || 'most recent'}`);
        for (let attempt = 0; attempt < 5; attempt++) { // Retry mechanism
            try {
                sigInfos = await connection.getSignaturesForAddress(programPubkey, { before, limit });
                if (verbose)
                    console.log(`[LOG] Fetched ${sigInfos.length} signature infos.`);
                break; // Success
            }
            catch (e) {
                if ((_a = e === null || e === void 0 ? void 0 : e.message) === null || _a === void 0 ? void 0 : _a.includes('429')) { // Rate limit
                    const delay = 500 * Math.pow(2, attempt);
                    if (verbose)
                        console.warn(`[WARN] Rate limit hit on getSignaturesForAddress. Retrying in ${delay}ms... (Attempt ${attempt + 1}/5)`);
                    await new Promise(res => setTimeout(res, delay));
                }
                else {
                    if (verbose)
                        console.error(`[ERROR] Failed to fetch signatures on attempt ${attempt + 1}: ${e.message}`);
                    if (attempt === 4)
                        throw e; // Re-throw on last attempt
                }
            }
        }
        if (sigInfos.length === 0) {
            // If `before` is defined and we get 0 signatures, it means we've reached the end of known history for that specific `before` signature,
            // or the program truly has no transactions if `before` was undefined initially.
            // If `earliestSig` is already set, we've found the oldest batch in a previous iteration.
            if (earliestSig) {
                foundAllSignatures = true; // We've already stored the earliest from a previous successful fetch
            }
            else {
                // This means no signatures were found at all for the program.
                throw new Error('No signatures found for this program. Signature fetch might have failed or the program has no transactions.');
            }
            break;
        }
        // The API returns signatures from newest to oldest.
        // The last one in the array is the oldest in *this batch*.
        earliestSig = sigInfos[sigInfos.length - 1].signature;
        if (sigInfos.length < limit) {
            // If fewer signatures than the limit are returned, we've reached the oldest ones.
            foundAllSignatures = true;
            if (verbose)
                console.log(`[LOG] Reached end of signature history, earliest in this batch: ${earliestSig}`);
        }
        else {
            // If we got a full batch, set `before` to the oldest signature in this batch
            // to get the next older batch in the next iteration.
            before = earliestSig;
            if (verbose)
                console.log(`[LOG] Continuing pagination, next 'before' will be: ${before}`);
        }
    }
    if (!earliestSig) {
        // This case should ideally be caught by the sigInfos.length === 0 check inside the loop.
        throw new Error('No signatures found for this program after pagination attempts.');
    }
    if (verbose)
        console.log(`[LOG] Determined earliest signature: ${earliestSig}`);
    return earliestSig;
}
async function fetchBlockTime(connection, signature, verbose) {
    var _a;
    let tx = null;
    if (verbose)
        console.log(`[LOG] Fetching transaction details for signature: ${signature}`);
    for (let attempt = 0; attempt < 5; attempt++) { // Retry mechanism
        try {
            tx = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0 // Important for modern transactions
            });
            if (verbose && tx)
                console.log(`[LOG] Transaction details fetched. BlockTime: ${tx.blockTime}`);
            else if (verbose && !tx)
                console.log(`[LOG] Transaction not found or null response for signature: ${signature} on attempt ${attempt + 1}`);
            break; // Success
        }
        catch (e) {
            if ((_a = e === null || e === void 0 ? void 0 : e.message) === null || _a === void 0 ? void 0 : _a.includes('429')) { // Rate limit
                const delay = 500 * Math.pow(2, attempt);
                if (verbose)
                    console.warn(`[WARN] Rate limit hit on getTransaction. Retrying in ${delay}ms... (Attempt ${attempt + 1}/5)`);
                await new Promise(res => setTimeout(res, delay));
            }
            else {
                if (verbose)
                    console.error(`[ERROR] Failed to fetch transaction on attempt ${attempt + 1}: ${e.message}`);
                if (attempt === 4)
                    throw e; // Re-throw on last attempt
            }
        }
    }
    if (!tx) {
        throw new Error(`Transaction fetch failed for signature ${signature} after max retries or transaction not found.`);
    }
    if (tx.blockTime === null || tx.blockTime === undefined) {
        throw new Error(`Block time is missing from the transaction for signature: ${signature}.`);
    }
    return tx.blockTime;
}
async function main() {
    const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
        .usage('Usage: $0 <programId> [--verbose] [--endpoint url]')
        .command('$0 <programId>', 'Fetches the first deployment timestamp of a Solana program ID.')
        .positional('programId', {
        describe: 'Solana program ID to query',
        type: 'string',
        demandOption: true // Makes this argument required
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
        .strict() // Report errors for unknown options
        .help() // Enable --help
        .alias('help', 'h')
        .wrap((0, yargs_1.default)((0, helpers_1.hideBin)(process.argv)).terminalWidth()) // Responsive help text
        .parseSync();
    const { programId, verbose, endpoint } = argv;
    if (verbose) {
        console.log('[LOG] CLI started with options:');
        console.log(`[LOG]   Program ID: ${programId}`);
        console.log(`[LOG]   Verbose: ${verbose}`);
        console.log(`[LOG]   Endpoint: ${endpoint || '(default list will be used)'}`);
    }
    const pubkey = (() => {
        try {
            return new web3_js_1.PublicKey(programId);
        }
        catch (err) {
            console.error(`[ERROR] Invalid program ID: ${programId}. ${err.message}`);
            process.exit(1);
        }
    })();
    const defaultEndpoints = [
        process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com', // Maintained by Serum community
        'https://api.rpcpool.com', // Another public option
        // Add more public endpoints here if desired, or from Helius as suggested in prompt
        // 'https://rpc.helius.xyz/?api-key=<YOUR_API_KEY>' // Example for Helius
    ];
    const endpointsToTry = endpoint ? [endpoint] : defaultEndpoints;
    let lastError = null;
    for (const url of endpointsToTry) {
        if (verbose)
            console.log(`[LOG] Attempting to use RPC endpoint: ${url}`);
        const connection = new web3_js_1.Connection(url, { commitment: 'confirmed' });
        try {
            const sig = await findFirstSignature(connection, pubkey, verbose);
            const blockTime = await fetchBlockTime(connection, sig, verbose);
            const deploymentDate = new Date(blockTime * 1000).toISOString();
            console.log(deploymentDate); // Final output
            process.exit(0); // Success
        }
        catch (err) {
            lastError = err;
            if (verbose) {
                console.error(`[ERROR] Endpoint ${url} failed: ${err.message}`);
                // console.error(err.stack); // Optionally log stack for more debug info
            }
            // Continue to the next endpoint if one fails
        }
    }
    console.error(`[ERROR] All configured RPC endpoints failed to retrieve the deployment timestamp.`);
    if (lastError) {
        console.error(`[ERROR] Last error encountered: ${lastError.message}`);
        // if (verbose && lastError.stack) console.error(lastError.stack);
    }
    else {
        console.error("[ERROR] No specific error message from last attempt, check logs if verbose mode was on.");
    }
    process.exit(1); // Failure
}
main().catch(err => {
    // This catch is for unexpected errors not handled within main's loop or specific functions.
    console.error(`[FATAL_ERROR] An unexpected error occurred: ${err.message}`);
    // if (err.stack) console.error(err.stack);
    process.exit(1);
});

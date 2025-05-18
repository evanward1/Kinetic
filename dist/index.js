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
    const limit = 1000;
    let before = undefined;
    let earliestSig = undefined;
    while (true) {
        let sigInfos = [];
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                sigInfos = await connection.getSignaturesForAddress(programPubkey, { before, limit });
                break;
            }
            catch (e) {
                if ((_a = e === null || e === void 0 ? void 0 : e.message) === null || _a === void 0 ? void 0 : _a.includes('429')) {
                    const delay = 500 * Math.pow(2, attempt);
                    if (verbose)
                        console.warn(`[WARN] Rate limit hit. Retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                }
                else {
                    throw e;
                }
            }
        }
        if (sigInfos.length === 0) {
            throw new Error('Signature fetch failed after max retries.');
        }
        earliestSig = sigInfos[sigInfos.length - 1].signature;
        if (sigInfos.length < limit)
            break;
        before = earliestSig;
    }
    if (!earliestSig) {
        throw new Error('No signatures found for this program');
    }
    return earliestSig;
}
async function fetchBlockTime(connection, signature, verbose) {
    var _a;
    let tx = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            tx = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            break;
        }
        catch (e) {
            if ((_a = e === null || e === void 0 ? void 0 : e.message) === null || _a === void 0 ? void 0 : _a.includes('429')) {
                const delay = 500 * Math.pow(2, attempt);
                if (verbose)
                    console.warn(`[WARN] Rate limit hit on transaction fetch. Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
            }
            else {
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
    const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
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
        .parseSync();
    const { programId, verbose, endpoint } = argv;
    const pubkey = (() => {
        try {
            return new web3_js_1.PublicKey(programId);
        }
        catch (err) {
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
    let lastError = null;
    for (const url of endpoints) {
        if (verbose)
            console.log(`[LOG] Trying endpoint ${url}`);
        const connection = new web3_js_1.Connection(url, { commitment: 'confirmed' });
        try {
            const sig = await findFirstSignature(connection, pubkey, verbose);
            const blockTime = await fetchBlockTime(connection, sig, verbose);
            console.log(new Date(blockTime * 1000).toISOString());
            process.exit(0);
        }
        catch (err) {
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

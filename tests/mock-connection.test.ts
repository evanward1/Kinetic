import { expect } from 'chai';
import sinon from 'sinon';
import { Connection, PublicKey, ConfirmedSignatureInfo, VersionedTransactionResponse, GetTransactionConfig } from '@solana/web3.js';
import { findFirstSignature, fetchBlockTime } from '../src/index'; // Path to refactored index
import logger from '../src/logger'; // Import logger
import { config as appConfig } from '../src/config'; // Import appConfig for retry counts
import {
  NoSignaturesFoundError,
  TransactionNotFoundError,
  MissingBlockTimeError,
  RpcMaxRetriesError,
} from '../src/errors';

describe('Mock Connection Tests (Refactored)', () => {
  let mockConnection: sinon.SinonStubbedInstance<Connection>;
  let programPubkey: PublicKey;

  let loggerStubs: {
    log: sinon.SinonStub,
    info: sinon.SinonStub,
    warn: sinon.SinonStub,
    error: sinon.SinonStub,
    fatal: sinon.SinonStub,
    debug: sinon.SinonStub,
    printResult: sinon.SinonStub,
    initialize: sinon.SinonStub,
  };

  beforeEach(() => {
    mockConnection = sinon.createStubInstance(Connection);
    programPubkey = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    loggerStubs = {
        log: sinon.stub(logger, 'log'),
        info: sinon.stub(logger, 'info'),
        warn: sinon.stub(logger, 'warn'),
        error: sinon.stub(logger, 'error'),
        fatal: sinon.stub(logger, 'fatal'),
        debug: sinon.stub(logger, 'debug'),
        printResult: sinon.stub(logger, 'printResult'),
        initialize: sinon.stub(logger, 'initialize'),
    };
    logger.initialize(false);
  });

  afterEach(() => {
    sinon.restore();
  });

  const createMockSigInfo = (signature: string, slot: number, blockTime: number | null = Date.now()/1000): ConfirmedSignatureInfo => ({
    signature,
    slot,
    err: null,
    memo: null,
    blockTime,
  });

  describe('findFirstSignature', () => {
    it('should find the earliest signature in a single batch', async () => {
      const sigs = [
        createMockSigInfo('sig3', 300),
        createMockSigInfo('sig2', 200),
        createMockSigInfo('sig1', 100),
      ];
      mockConnection.getSignaturesForAddress.resolves(sigs);

      const earliest = await findFirstSignature(mockConnection, programPubkey);
      expect(earliest).to.equal('sig1');
      expect(mockConnection.getSignaturesForAddress.calledOnceWith(programPubkey, { limit: appConfig.signatureFetchLimit })).to.be.true;
    });

    it('should find the earliest signature with pagination', async () => {
      const batch1Limit = appConfig.signatureFetchLimit;
      const batch1 = Array.from({ length: batch1Limit }, (_, i) => createMockSigInfo(`sig_batch1_${batch1Limit - 1 - i}`, 2000 + batch1Limit - 1 - i));
      const batch2 = [
        createMockSigInfo('sig_batch2_3', 1200),
        createMockSigInfo('sig_batch2_2', 1100),
        createMockSigInfo('sig_batch2_1', 1000),
      ];

      mockConnection.getSignaturesForAddress
        .onFirstCall().resolves(batch1)
        .onSecondCall().resolves(batch2);

      const earliest = await findFirstSignature(mockConnection, programPubkey);
      expect(earliest).to.equal('sig_batch2_1');
      expect(mockConnection.getSignaturesForAddress.calledTwice).to.be.true;
    });

    it('should throw NoSignaturesFoundError if no signatures are found', async () => {
      mockConnection.getSignaturesForAddress.resolves([]);
      try {
        await findFirstSignature(mockConnection, programPubkey);
        expect.fail('Should have thrown NoSignaturesFoundError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(NoSignaturesFoundError);
      }
    });

    it('should handle rate limit with retries for getSignaturesForAddress', async function() {
      this.timeout(appConfig.retry.getSignatures.initialDelayMs * 3);
      const sigs = [createMockSigInfo('sig1', 100)];
      mockConnection.getSignaturesForAddress
        .onFirstCall().rejects({ message: '429 Too Many Requests' })
        .onSecondCall().resolves(sigs);

      await findFirstSignature(mockConnection, programPubkey);
      expect(loggerStubs.warn.calledWith(sinon.match(/Rate limit hit on getSignaturesForAddress/))).to.be.true;
    });

    it('should throw RpcMaxRetriesError after max retries for getSignaturesForAddress on rate limit', async function() {
      const totalRetryDelay = (appConfig.retry.getSignatures.attempts) * appConfig.retry.getSignatures.maxDelayMs + 2000; // Sum of max delays + buffer
      this.timeout(totalRetryDelay);
      mockConnection.getSignaturesForAddress.rejects({ message: '429 Too Many Requests' }); // Mock to always reject
      try {
        await findFirstSignature(mockConnection, programPubkey);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.message).to.include('getSignaturesForAddress'); // Check operation name
        expect(e.originalError).to.be.instanceOf(Error); // Ensure it's wrapped in an Error
        expect(e.originalError.message).to.include('429 Too Many Requests'); // Check original message
        expect(mockConnection.getSignaturesForAddress.callCount).to.equal(appConfig.retry.getSignatures.attempts);
      }
    });

    it('should throw RpcMaxRetriesError if getSignaturesForAddress throws an unexpected error after all retries', async function() {
      const totalRetryDelay = (appConfig.retry.getSignatures.attempts) * appConfig.retry.getSignatures.maxDelayMs + 2000;
      this.timeout(totalRetryDelay);
      const networkError = new Error('Network failure');
      mockConnection.getSignaturesForAddress.rejects(networkError);
      try {
        await findFirstSignature(mockConnection, programPubkey);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.originalError).to.equal(networkError);
      }
    });
  });

  describe('fetchBlockTime', () => {
    const testSignature = 'testSig123';
    const mockTxResponse = (blockTime: number | null | undefined): VersionedTransactionResponse | null => {
        if (blockTime === undefined) return null;
        return {
            slot: 12345,
            transaction: {} as any,
            meta: {} as any,
            blockTime: blockTime,
            version: 0,
        };
    };

    it('should return blockTime for a valid signature', async () => {
      const expectedBlockTime = Math.floor(Date.now() / 1000) - 3600;
      mockConnection.getTransaction.resolves(mockTxResponse(expectedBlockTime));
      const blockTime = await fetchBlockTime(mockConnection, testSignature);
      expect(blockTime).to.equal(expectedBlockTime);
    });

    it('should throw RpcMaxRetriesError wrapping TransactionNotFoundError if transaction is not found (returns null from RPC)', async function() {
      const totalRetryDelay = (appConfig.retry.getTransaction.attempts) * appConfig.retry.getTransaction.maxDelayMs + 2000;
      this.timeout(totalRetryDelay);
      mockConnection.getTransaction.resolves(null); // This will cause TransactionNotFoundError inside operationFn
      try {
        await fetchBlockTime(mockConnection, testSignature);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.originalError).to.be.instanceOf(TransactionNotFoundError);
        expect(e.originalError.message).to.include(`Transaction ${testSignature} not found by RPC node.`);
        expect(mockConnection.getTransaction.callCount).to.equal(appConfig.retry.getTransaction.attempts);
      }
    });
    
    it('should throw RpcMaxRetriesError wrapping TransactionNotFoundError if getTransaction itself throws it', async function() {
      const totalRetryDelay = (appConfig.retry.getTransaction.attempts) * appConfig.retry.getTransaction.maxDelayMs + 2000;
      this.timeout(totalRetryDelay);
      const specificError = new TransactionNotFoundError(testSignature, `Explicit ${testSignature} not found.`);
      mockConnection.getTransaction.callsFake(async () => { throw specificError; });
      try {
        await fetchBlockTime(mockConnection, testSignature);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.originalError).to.equal(specificError); // Check for the exact error instance
        expect(mockConnection.getTransaction.callCount).to.equal(appConfig.retry.getTransaction.attempts);
      }
    });

    it('should throw MissingBlockTimeError if blockTime is null in the transaction response', async () => {
      mockConnection.getTransaction.resolves(mockTxResponse(null));
      try {
        await fetchBlockTime(mockConnection, testSignature);
      } catch (e: any) {
        expect(e).to.be.instanceOf(MissingBlockTimeError);
      }
    });

    it('should handle rate limit with retries for getTransaction', async function() {
      this.timeout(appConfig.retry.getTransaction.initialDelayMs * 3);
      const expectedBlockTime = Math.floor(Date.now() / 1000);
      mockConnection.getTransaction
        .onFirstCall().rejects({ message: '429 Too Many Requests' })
        .onSecondCall().resolves(mockTxResponse(expectedBlockTime));
      await fetchBlockTime(mockConnection, testSignature);
      expect(loggerStubs.warn.calledWith(sinon.match(/Rate limit hit on getTransaction/))).to.be.true;
    });

    it('should throw RpcMaxRetriesError after max retries for getTransaction on rate limit', async function() {
      const totalRetryDelay = (appConfig.retry.getTransaction.attempts) * appConfig.retry.getTransaction.maxDelayMs + 2000;
      this.timeout(totalRetryDelay);
      mockConnection.getTransaction.rejects({ message: '429 Too Many Requests' });
      try {
        await fetchBlockTime(mockConnection, testSignature);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.originalError).to.be.instanceOf(Error);
        expect(e.originalError.message).to.include('429 Too Many Requests');
        expect(mockConnection.getTransaction.callCount).to.equal(appConfig.retry.getTransaction.attempts);
      }
    });

    it('should throw RpcMaxRetriesError if getTransaction throws an unexpected error after all retries', async function() {
      const totalRetryDelay = (appConfig.retry.getTransaction.attempts) * appConfig.retry.getTransaction.maxDelayMs + 2000;
      this.timeout(totalRetryDelay);
      const rpcError = new Error('RPC unavailable');
      mockConnection.getTransaction.rejects(rpcError);
      try {
        await fetchBlockTime(mockConnection, testSignature);
        expect.fail('Should have thrown RpcMaxRetriesError');
      } catch (e: any) {
        expect(e).to.be.instanceOf(RpcMaxRetriesError);
        expect(e.originalError).to.equal(rpcError);
      }
    });
  });
});

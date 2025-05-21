import { expect } from 'chai';
import sinon from 'sinon';
import { Connection, PublicKey, ConfirmedSignatureInfo, VersionedTransactionResponse, GetTransactionConfig } from '@solana/web3.js';
import { findFirstSignature, fetchBlockTime } from '../src/index'; // Adjust path if your src folder is different

describe('Mock Connection Tests', () => {
  let mockConnection: sinon.SinonStubbedInstance<Connection>;
  let programPubkey: PublicKey;
  const verbose = false; // Set to true for debugging test logs, false for clean test output

  beforeEach(() => {
    mockConnection = sinon.createStubInstance(Connection);
    programPubkey = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
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

      const earliest = await findFirstSignature(mockConnection, programPubkey, verbose);
      expect(earliest).to.equal('sig1');
      expect(mockConnection.getSignaturesForAddress.calledOnceWith(programPubkey, { limit: 1000 })).to.be.true;
    });

    it('should find the earliest signature with pagination', async () => {
      const batch1Limit = 1000;
      const batch1 = Array.from({ length: batch1Limit }, (_, i) => createMockSigInfo(`sig_batch1_${batch1Limit - 1 - i}`, 2000 + batch1Limit - 1 - i));
      const batch2 = [
        createMockSigInfo('sig_batch2_3', 1200),
        createMockSigInfo('sig_batch2_2', 1100),
        createMockSigInfo('sig_batch2_1', 1000),
      ];

      mockConnection.getSignaturesForAddress
        .onFirstCall().resolves(batch1)
        .onSecondCall().resolves(batch2);

      const earliest = await findFirstSignature(mockConnection, programPubkey, verbose);
      expect(earliest).to.equal('sig_batch2_1');
      expect(mockConnection.getSignaturesForAddress.calledTwice).to.be.true;
      expect(mockConnection.getSignaturesForAddress.getCall(0).args[1]).to.deep.equal({ limit: 1000 });
      expect(mockConnection.getSignaturesForAddress.getCall(1).args[1]).to.deep.equal({
        limit: 1000,
        before: batch1[batch1.length - 1].signature,
      });
    });

    it('should throw an error if no signatures are found', async () => {
      mockConnection.getSignaturesForAddress.resolves([]);
      try {
        await findFirstSignature(mockConnection, programPubkey, verbose);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.message).to.include('No signatures found for this program');
      }
    });

    it('should handle rate limit with retries for getSignaturesForAddress', async function() { // Use function for this.timeout
      this.timeout(5000); // Increase timeout for this specific test due to retries
      const sigs = [createMockSigInfo('sig1', 100)];
      mockConnection.getSignaturesForAddress
        .onFirstCall().rejects({ message: '429 Too Many Requests' }) // First attempt fails
        .onSecondCall().resolves(sigs); // Second attempt succeeds

      const earliest = await findFirstSignature(mockConnection, programPubkey, verbose);
      expect(earliest).to.equal('sig1');
      expect(mockConnection.getSignaturesForAddress.calledTwice).to.be.true;
    });

    it('should throw after max retries for getSignaturesForAddress on rate limit', async function() { // Use function for this.timeout
      this.timeout(16000); // Needs to be longer than sum of all retry delays (500+1000+2000+4000+8000 = 15500)
      mockConnection.getSignaturesForAddress.rejects({ message: '429 Too Many Requests' });
      try {
        await findFirstSignature(mockConnection, programPubkey, verbose);
        expect.fail('Should have thrown an error after max retries');
      } catch (e: any) {
        expect(e.message).to.include('429 Too Many Requests');
        expect(mockConnection.getSignaturesForAddress.callCount).to.equal(5);
      }
    });

    it('should throw an error if getSignaturesForAddress throws an unexpected error', async () => {
      mockConnection.getSignaturesForAddress.rejects(new Error('Network failure'));
      try {
        await findFirstSignature(mockConnection, programPubkey, verbose);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.message).to.equal('Network failure');
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

      const blockTime = await fetchBlockTime(mockConnection, testSignature, verbose);
      expect(blockTime).to.equal(expectedBlockTime);
      // Updated assertion: removed maxSupportedTransactionVersion
      const expectedConfig: GetTransactionConfig = { commitment: 'confirmed' };
      expect(mockConnection.getTransaction.calledOnceWith(testSignature, expectedConfig)).to.be.true;
    });

    it('should throw an error if transaction is not found (returns null)', async () => {
      mockConnection.getTransaction.resolves(null);
      try {
        await fetchBlockTime(mockConnection, testSignature, verbose);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.message).to.include(`Transaction fetch failed for signature ${testSignature}`);
      }
    });

    it('should throw an error if blockTime is null in the transaction response', async () => {
      mockConnection.getTransaction.resolves(mockTxResponse(null));
      try {
        await fetchBlockTime(mockConnection, testSignature, verbose);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.message).to.include(`Block time is missing from the transaction for signature: ${testSignature}`);
      }
    });

    it('should handle rate limit with retries for getTransaction', async function() { // Use function for this.timeout
      this.timeout(5000); // Increase timeout for this specific test
      const expectedBlockTime = Math.floor(Date.now() / 1000);
      mockConnection.getTransaction
        .onFirstCall().rejects({ message: '429 Too Many Requests' })
        .onSecondCall().resolves(mockTxResponse(expectedBlockTime));

      const blockTime = await fetchBlockTime(mockConnection, testSignature, verbose);
      expect(blockTime).to.equal(expectedBlockTime);
      expect(mockConnection.getTransaction.calledTwice).to.be.true;
    });

    it('should throw after max retries for getTransaction on rate limit', async function() { // Use function for this.timeout
      this.timeout(16000); // Needs to be longer than sum of all retry delays
      mockConnection.getTransaction.rejects({ message: '429 Too Many Requests' });
      try {
        await fetchBlockTime(mockConnection, testSignature, verbose);
        expect.fail('Should have thrown an error after max retries');
      } catch (e: any) {
        expect(e.message).to.include('429 Too Many Requests');
        expect(mockConnection.getTransaction.callCount).to.equal(5);
      }
    });

    it('should throw an error if getTransaction throws an unexpected error', async () => {
      mockConnection.getTransaction.rejects(new Error('RPC unavailable'));
      try {
        await fetchBlockTime(mockConnection, testSignature, verbose);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.message).to.equal('RPC unavailable');
      }
    });
  });
});

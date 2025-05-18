import { expect } from 'chai';
import sinon from 'sinon';
import { PublicKey } from '@solana/web3.js';
import * as index from '../src/index';

describe('CLI with mocked RPC', () => {
  let getSignaturesStub: sinon.SinonStub;
  let getTransactionStub: sinon.SinonStub;
  let consoleLog: sinon.SinonSpy;
  let exitStub: sinon.SinonStub;

  beforeEach(() => {
    getSignaturesStub = sinon.stub().resolves([{ signature: 'sig' }]);
    getTransactionStub = sinon.stub().resolves({ blockTime: 1700000000 });
    sinon.stub(index as any, 'findFirstSignature').callsFake(() => getSignaturesStub());
    sinon.stub(index as any, 'fetchBlockTime').callsFake(() => getTransactionStub());

    consoleLog = sinon.spy(console, 'log');
    exitStub = sinon.stub(process, 'exit');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('prints ISO timestamp for first signature', async () => {
    await index.mainForTest(['node', 'kinetic-solana-cli', '4Nd1mPA99YVZFGSQY1ZuvQVJ6G8eKRAKvE4Dr7fM2nQa']);
    expect(consoleLog.calledWith(new Date(1700000000 * 1000).toISOString())).to.be.true;
  });
});
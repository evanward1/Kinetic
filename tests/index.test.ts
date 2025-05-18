import { exec } from 'child_process';
import { expect } from 'chai';
import { describe, it } from 'mocha';

describe('kinetic-solana-cli', () => {
  it('fails gracefully on invalid program ID', done => {
    exec('ts-node src/index.ts badPubkey', (error, stdout, stderr) => {
      expect(stderr).to.include('Invalid program ID');
      done();
    });
  });
});

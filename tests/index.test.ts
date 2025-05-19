import { exec } from 'child_process';
import { expect } from 'chai';
import { describe, it } from 'mocha';

describe('kinetic-solana-cli', () => {
  const cliCommand = 'ts-node src/index.ts'; // Or 'node dist/index.js' for built version

  it('fails gracefully on invalid program ID', done => {
    exec(`${cliCommand} badPubkey`, (error, stdout, stderr) => {
      expect(stderr).to.include('Invalid program ID');
      // error should not be null because the process exits with 1
      expect(error).to.not.be.null;
      if (error) {
        expect(error.code).to.equal(1);
      }
      done();
    });
  }).timeout(5000); // Increased timeout for CLI execution

  it('prints help message with --help flag', done => {
    exec(`${cliCommand} --help`, (error, stdout, stderr) => {
      expect(error).to.be.null;
      expect(stdout).to.include('Usage: index.ts <programId>');
      expect(stdout).to.include('Solana program ID to query'); // This comes from yargs .positional()
      expect(stdout).to.include('--verbose');                 // This comes from yargs .option()
      expect(stdout).to.include('--endpoint');                // This comes from yargs .option()
      done();
    });
  }).timeout(5000);
});
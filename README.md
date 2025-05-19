# kinetic-solana-cli

A command-line tool to fetch the first deployment timestamp of a Solana program.

## FEATURES

* Fully typed TypeScript codebase (--strict mode enabled)
* Uses VersionedTransactionResponse (no legacy types)
* Handles Solana RPC rate limits with exponential backoff
* Supports custom RPC endpoints
* Cycles through multiple default RPC endpoints for robustness
* CLI-friendly output with ISO timestamp

---

## INSTALLATION

Clone the repo and install dependencies:

bash
git clone <your-repo-url>
cd <your-repo-name>
npm install

Build the CLI:

bash
npm run build

---

## USAGE

bash
node dist/index.js <PROGRAM_ID> [--verbose] [--endpoint <rpc_url>]

Example:

bash
node dist/index.js TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose

ARGUMENTS:
* PROGRAM_ID: The Solana program’s public key (e.g., TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA).
* --verbose (-v): (Optional) Enables detailed logging, including RPC endpoint attempts and retry mechanisms for rate limits.
* --endpoint <rpc_url> (-e <rpc_url>): (Optional) Specifies a custom Solana RPC endpoint URL to use. If not provided, the tool will cycle through a list of default public RPC endpoints.

---

## SYSTEM ARCHITECTURE

The kinetic-solana-cli tool operates with a straightforward architecture:

1.  Command-Line Interface (CLI) Input: The user provides a Solana Program ID as a command-line argument. Optional flags like --verbose and --endpoint can also be used. Argument parsing is handled by the yargs library.
2.  RPC Endpoint Interaction:
    * The tool establishes a connection to a Solana RPC endpoint. It defaults to a list of public RPC URLs (https://api.mainnet-beta.solana.com, https://solana-api.projectserum.com, https://api.rpcpool.com) or uses a user-specified endpoint via the --endpoint flag.
    * It utilizes the @solana/web3.js library for all on-chain communication.
3.  Signature Fetching (Finding First Deployment):
    * To find the first deployment, the tool calls the getSignaturesForAddress RPC method. It fetches the transaction history for the given program ID by paginating backwards through the program's transaction history in batches (limit of 1000 per request).
    * It iterates until it has retrieved the oldest available batch of signatures. The last signature in this oldest batch (which is the earliest chronologically) is presumed to correspond to the earliest transaction.
    * The timestamp of this earliest transaction is considered the first deployment time.
4.  Transaction Detail Retrieval:
    * Once the presumed earliest signature is identified, the getTransaction RPC method is called to fetch the details of that transaction, requesting maxSupportedTransactionVersion: 0 to ensure compatibility with versioned transactions.
5.  Timestamp Extraction & Output:
    * The blockTime (a Unix timestamp) is extracted from the transaction details.
    * This timestamp is converted to an ISO-8601 string (UTC) and printed to the console.
6.  Error Handling & Robustness:
    * Includes retries with exponential backoff (5 attempts per RPC call type per endpoint) for rate-limited RPC requests (HTTP 429).
    * Attempts to cycle through multiple RPC endpoints if one fails to fetch the required information.
    * Provides verbose logging for debugging and insight into the process when the --verbose flag is used.
    * Validates the program ID format before making network requests.

---

## DEVELOPER SCRIPTS

* Build: Compiles TypeScript to JavaScript in the /dist directory.
    bash
    npm run build

* Run (Development): Executes the tool using ts-node directly from the src directory.
    bash
    npm start -- <PROGRAM_ID> [options]
    Example:
    npm start -- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose

* Test: Runs unit tests using Mocha and Chai.
    bash
    npm test

---

## DOCKER SUPPORT

A Dockerfile is provided to build and run this tool in a Docker container.

Build the Docker image:
bash
docker build -t kinetic-solana-cli .

Run the Docker container:
bash
docker run --rm kinetic-solana-cli <PROGRAM_ID> [--verbose] [--endpoint <rpc_url>]

Example:
bash
docker run --rm kinetic-solana-cli TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose

A GitHub Actions workflow (.github/workflows/docker-publish.yml) is also included to automatically build and publish the Docker image to a container registry (e.g., DockerHub) upon new version tags (e.g., v1.0.0). Note: You'll need to configure DOCKERHUB_USER and DOCKERHUB_TOKEN secrets in your GitHub repository settings and update the image name in the workflow file for this to function.

---

## NOTES

* This tool uses modern versioned transaction decoding (VersionedTransactionResponse) for compatibility with the latest Solana transaction formats.
* Block time is returned as a UTC ISO-8601 timestamp (e.g., 2023-05-15T10:30:00.000Z).
* All TypeScript code strictly adheres to the SDK typings and has strict mode enabled in tsconfig.json for better code quality and error detection.

---

## LICENSE

MIT
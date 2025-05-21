Okay, here is the raw Markdown content from the immersive document `solana_cli_readme_full_markdown_v1`. You can copy this and paste it directly into your `README.md` file:

````markdown
# Kinetic Solana Program Timestamp CLI

A command-line tool to fetch the first deployment timestamp of a Solana program. This tool is built with TypeScript, emphasizing robustness, configurability, and best practices for interacting with the Solana blockchain.

## Features

* **Accurate Timestamp Retrieval:** Determines the block timestamp of a Solana program's first deployment.
* **TypeScript Codebase:** Fully typed with strict mode enabled for enhanced code quality and maintainability.
* **Robust RPC Interaction:**
  * Cycles through a configurable list of public RPC endpoints.
  * Prioritizes a dedicated RPC endpoint (e.g., from Helius) if configured via the `HELIUS_API_KEY` environment variable or specified with the `--endpoint` flag.
  * Implements retries with exponential backoff for RPC calls to handle rate limiting (HTTP 429) and transient network issues.
* **Configurable:** Key parameters like RPC endpoints and retry logic are managed in a dedicated configuration module (`src/config.ts`).
* **Structured Logging:** Utilizes a logger module (`src/logger.ts`) with verbose option (`--verbose` / `-v`) for detailed operational insights and debugging.
* **Custom Error Handling:** Employs custom error types (`src/errors.ts`) for more precise error identification and reporting.
* **Modern Solana Features:** Uses `VersionedTransactionResponse` for compatibility with the latest Solana transaction formats.
* **CLI-Friendly Output:** Prints the deployment timestamp in ISO-8601 format (UTC).
* **Comprehensive Testing:** Includes end-to-end CLI tests and unit/integration tests with mocks for core logic.
* **Docker Support:** Comes with a `Dockerfile` for easy containerization and a GitHub Actions workflow for automated Docker image publishing.

---

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url> kinetic-solana-cli
    cd kinetic-solana-cli
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the CLI:**
    ```bash
    npm run build
    ```
    This compiles the TypeScript source from `src/` to JavaScript in `dist/`.

---

## Usage

Execute the CLI from the project root after building:

```bash
node dist/index.js <PROGRAM_ID> [options]
````

Or, using the `npm start` script (which uses `ts-node` for development):

```bash
npm start -- <PROGRAM_ID> [options]
```

### Arguments:

  * **`<PROGRAM_ID>`** (Required): The Solana program's public key (e.g., `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`).

### Options:

  * **`--verbose`**, **`-v`**: (Optional) Enables detailed logging, including RPC endpoint attempts, retry mechanisms, and other diagnostic information.
  * **`--endpoint <rpc_url>`**, **`-e <rpc_url>`**: (Optional) Specifies a custom Solana RPC endpoint URL to use. This will override the default list and any environment-configured dedicated RPC.

### Environment Variables for RPC Configuration:

  * **`HELIUS_API_KEY`**: (Optional) If you have an API key from a provider like Helius, set this environment variable. The tool will construct the Helius RPC URL and prioritize it.
    ```bash
    export HELIUS_API_KEY="your_api_key_here" # On macOS/Linux
    # $env:HELIUS_API_KEY="your_api_key_here" # On PowerShell
    ```
  * **`SOLANA_RPC_URL`**: (Optional) If set, this URL will be included in the list of default public RPCs that the tool attempts to use (it will be the first in the default list if `HELIUS_API_KEY` is not set).

### Examples:

  * **Get timestamp for the SPL Token Program (verbose, using default/env RPCs):**

    ```bash
    npm start -- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose
    ```

  * **Get timestamp for the Memo Program using a specific custom endpoint:**

    ```bash
    npm start -- Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo -e [https://api.mainnet-beta.solana.com](https://api.mainnet-beta.solana.com)
    ```

  * **Using a Helius RPC endpoint via environment variable:**

    ```bash
    export HELIUS_API_KEY="YOUR_ACTUAL_HELIUS_KEY"
    npm start -- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose
    ```

-----

## System Architecture

The `kinetic-solana-cli` tool is structured with modularity and best practices in mind:

1.  **CLI Input (`yargs`)**:

      * The `main()` function in `src/index.ts` uses the `yargs` library to parse command-line arguments (`programId`) and options (`--verbose`, `--endpoint`).

2.  **Configuration (`src/config.ts`)**:

      * A dedicated module (`config.ts`) centralizes application settings, including:
          * Default public RPC endpoints.
          * Logic to incorporate a Helius RPC URL if `HELIUS_API_KEY` is set in the environment.
          * Retry parameters (attempts, delays) for RPC calls.
          * Signature fetch limits.
      * The `getEffectiveRpcEndpoints()` function determines the list of RPC URLs to try, prioritizing CLI-specified, then environment-configured (Helius), then defaults.

3.  **Logging (`src/logger.ts`)**:

      * A simple logger module provides structured log messages prefixed with levels (e.g., `[LOG]`, `[INFO]`, `[ERROR]`).
      * Logging verbosity is controlled by the `--verbose` flag, initialized via `logger.initialize()`.

4.  **Custom Errors (`src/errors.ts`)**:

      * Defines custom error classes (e.g., `NoSignaturesFoundError`, `RpcMaxRetriesError`) for more specific and informative error handling throughout the application.

5.  **Core Logic (`src/index.ts`)**:

      * **`findFirstSignature(connection, programPubkey)`**:
          * Paginates backwards through the program's transaction history using `connection.getSignaturesForAddress`.
          * Fetches signatures in batches (limit defined in `config.ts`).
          * The last signature in the oldest complete batch is considered the earliest.
      * **`fetchBlockTime(connection, signature)`**:
          * Retrieves the transaction details for the given signature using `connection.getTransaction`.
          * Extracts the `blockTime` (Unix timestamp).
      * **`retryOperation(operationName, operationFn, retryConfig)`**:
          * A generic helper function that wraps an asynchronous operation (like an RPC call).
          * Implements retry logic with exponential backoff (using delays from `config.ts`) if the operation fails, particularly for rate-limiting errors (HTTP 429).
          * Throws an `RpcMaxRetriesError` if all attempts fail.

6.  **Execution Flow (`main()` in `src/index.ts`)**:

      * Initializes the logger.
      * Validates the input `programId` (throws `InvalidProgramIdError` if invalid).
      * Determines the list of RPC endpoints to try using `getEffectiveRpcEndpoints()`.
      * Iterates through these endpoints:
          * Creates a Solana `Connection` object.
          * Calls `findFirstSignature()` then `fetchBlockTime()`.
          * If successful, converts the Unix timestamp to an ISO-8601 string and prints it using `logger.printResult()`, then exits.
          * If an error occurs with an endpoint, logs the error and tries the next endpoint.
      * If all endpoints fail, logs a fatal error and exits with a non-zero status code.
      * Top-level error handling ensures graceful exit for unhandled exceptions.

-----

## Developer Scripts

  * **Build TypeScript to JavaScript:**

    ```bash
    npm run build
    ```

  * **Run CLI in development (using `ts-node`):**

    ```bash
    npm start -- <PROGRAM_ID> [options]
    ```

    Example:

    ```bash
    npm start -- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA -v
    ```

  * **Run Tests:**

    ```bash
    npm test
    ```

    This executes test files in the `tests/` directory (e.g., `index.test.ts` for CLI E2E tests and `mock-connection.test.ts` for unit/integration tests of core logic with mocked connections).

-----

## Docker Support

A `Dockerfile` is provided to build and run this tool in a Docker container.

1.  **Build the Docker image:**

    ```bash
    docker build -t kinetic-solana-cli .
    ```

2.  **Run the Docker container:**

    ```bash
    docker run --rm kinetic-solana-cli <PROGRAM_ID> [options]
    ```

    Example:

    ```bash
    docker run --rm kinetic-solana-cli TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose
    ```

    To use environment variables like `HELIUS_API_KEY` with Docker:

    ```bash
    docker run --rm -e HELIUS_API_KEY="your_api_key_here" kinetic-solana-cli TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
    ```

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) is also included to automatically build and publish the Docker image to a container registry (e.g., DockerHub or GitHub Container Registry) upon new version tags (e.g., `v1.0.0`). You'll need to configure secrets (`DOCKERHUB_USER`, `DOCKERHUB_TOKEN` or equivalent for GHCR) in your GitHub repository settings and update the image name in the workflow file for this to function.

-----

## Notes on RPC Endpoints & Performance

  * This tool attempts to be robust when using public Solana RPC endpoints by retrying on rate limits and cycling through multiple defaults.
  * However, for programs with extremely long transaction histories (e.g., the SPL Token Program), public RPCs may still impose limitations that make it challenging to fetch the absolute earliest transaction.
  * **For best performance and reliability, especially with very active programs or for frequent use, it is highly recommended to use a dedicated RPC endpoint provider (e.g., Helius, Triton, QuickNode).** The tool supports this via the `--endpoint` flag or by setting the `HELIUS_API_KEY` environment variable.

-----

## License

MIT

```
```
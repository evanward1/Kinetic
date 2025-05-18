# kinetic-solana-cli

A command-line tool to fetch the first deployment timestamp of a Solana program.

## 🚀 Features

* Fully typed TypeScript codebase (`--strict` mode enabled)
* Uses `VersionedTransactionResponse` (no legacy types)
* Handles Solana RPC rate limits with exponential backoff
* Supports custom RPC endpoints
* CLI-friendly output with ISO timestamp

---

## 🛠 Installation

Clone the repo and install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

---

## 🧪 Usage

```bash
node dist/index.js <PROGRAM_ID> [--verbose] [--endpoint <rpc_url>]
```

### Example:

```bash
node dist/index.js TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --verbose
```

* `PROGRAM_ID`: the Solana program’s public key
* `--verbose`: (optional) logs retries and endpoints tried
* `--endpoint`: (optional) use a custom Solana RPC endpoint

---

## 🧰 Developer Scripts

```bash
npm run build    # Compiles TypeScript to /dist
npm start -- <args>  # Runs with ts-node (for dev)
```

To run tests (if implemented):

```bash
npm test
```

---

## 📄 Notes

* This tool uses modern versioned transaction decoding (`VersionedTransactionResponse`)
* Block time is returned as a UTC ISO-8601 timestamp
* All TypeScript code strictly adheres to the SDK typings

---

## 📜 License

MIT

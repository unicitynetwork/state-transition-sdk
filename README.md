# State Transition SDK

## Overview

The State Transition SDK is a TypeScript library that provides an off-chain token transaction framework. Tokens are managed, stored, and transferred off-chain with only cryptographic commitments published on-chain, ensuring privacy while preventing double-spending through single-spend proofs.
This is a low-level SDK, that supports transferring tokens, making payments, and splitting tokens. 
In this system, tokens are self-contained entities containing complete transaction history and cryptographic proofs attesting to their current state (ownership, value, etc.). State transitions are verified through consultation with blockchain infrastructure (Unicity) to produce proof of single spend.

### Key Features

- **Off-chain Privacy**: Cryptographic commitments contain no information about tokens, their state, or transaction nature
- **Horizontal Scalability**: Millions of transaction commitments per block capability  
- **Zero-Knowledge Transactions**: Observers cannot determine if commitments refer to token transactions or other processes
- **Offline Transaction Support**: Create and serialize transactions without network connectivity
- **TypeScript Support**: Full type safety and modern development experience
- **Modular Architecture**: Pluggable address schemes, predicates, and token types

## Installation

```bash
npm install @unicitylabs/state-transition-sdk
```

## Quick Start

End-to-end runnable examples live under [`tests/examples/`](./tests/examples):

- Mint: [`tests/examples/mint/ExampleTest.ts`](./tests/examples/mint/ExampleTest.ts)
- Transfer: [`tests/examples/transfer/ExampleTest.ts`](./tests/examples/transfer/ExampleTest.ts)
- Split: [`tests/examples/split/ExampleTest.ts`](./tests/examples/split/ExampleTest.ts)

Tokens are shipped between parties as CBOR — use `token.toCBOR()` on the sender side and `Token.fromCBOR(bytes)` on the receiver side.

## Core Components

### StateTransitionClient

A thin client over the aggregator. As a consumer you'll typically:

1. Build a `MintTransaction` or `TransferTransaction`.
2. Submit its `CertificationData` and wait for an inclusion proof.
3. Turn it into a certified transaction and apply it to a `Token` (`Token.mint` / `token.transfer`).
4. Call `token.verify(...)` on the receiving side.

`StateTransitionClient` covers step 2 only:

- `submitCertificationRequest()` - Submit a commitment to the aggregator
- `getInclusionProof()` - Retrieve an inclusion proof for a state id

### Transaction Flow

1. **Minting**: Create new tokens
2. **Transfer**: Submit state transitions between owners

#### Transfer flow

Prerequisites
Recipient knows some info about token, like token type for generating address.

```text
A[Start] 
A --> B[Recipient Generates Predicate]
B --> C[Recipient Shares Predicate with Sender]
C --> D[Sender Creates Transaction]
D --> E[Sender Submits Transaction]
E --> F[Sender Retrieves Inclusion Proof]
F --> G[Sender Creates Certified Transaction]
G --> H[Sender Updates Token with Certified Transaction]
H --> I[Sender Sends Token to Recipient]
I --> J[End]
```

## Architecture

### Token Structure

A `Token` is a self-contained, CBOR-serializable record that bundles its genesis with an ordered transfer history:

- `genesis`: a `CertifiedMintTransaction` (a `MintTransaction` plus the reference time it was certified under and its `InclusionProof`). The mint transaction carries `networkId`, `tokenId`, `tokenType`, `salt`, `recipient`, optional `justification`, and optional `data`.
- `transactions`: an ordered list of `CertifiedTransferTransaction` entries, each wrapping a `TransferTransaction` (recipient, state mask, optional data) with its reference time and `InclusionProof`.

Each certified transaction carries the reference time of the round it was validated in. The aggregator's sparse Merkle tree stores `SHA-256(CBOR([transactionHash, referenceTime]))` as the leaf value, so the reference time is a property of the leaf rather than of whichever proof happens to establish it. The tree is append-only, and a proof fetched later is anchored to a later root whose input record carries a later time; verification uses the carried reference time and rejects any value that does not reproduce the certified leaf.

See [`src/transaction/Token.ts`](./src/transaction/Token.ts) for the authoritative shape.

### Privacy Model
- **Commitment-based**: Only cryptographic commitments published on-chain
- **Self-contained**: Tokens include complete transaction history
- **Zero-knowledge**: No information leaked about token or transaction details
- **Minimal footprint**: Blockchain only stores commitment hashes

### Security Features
- **Double-spend prevention**: Enforced through inclusion proofs
- **Cryptographic verification**: All state transitions cryptographically verified
- **Predicate flexibility**: Multiple ownership models supported
- **Provenance tracking**: Complete audit trail in token history

## Development

### Building

```bash
npm run build
```

### Testing

Run the default suite (unit + functional tests):

```bash
npm test
```

Run the example flows (requires a reachable aggregator; URL is read from each example's `config.json`):

```bash
npm run test:examples
```

Run the end-to-end suite (defaults to a local aggregator at `http://localhost:3000`):

```bash
npm run test:e2e
```

To run it against another network, point it at that endpoint and supply the matching trust base:

```bash
AGGREGATOR_URL=https://gateway.example.unicity.network \
TRUST_BASE_PATH=/path/to/trust-base.json \
AGGREGATOR_API_KEY=<key, if the endpoint requires one> \
npm run test:e2e
```

### Linting

Lint all code (source and tests):
```bash
npm run lint
```

Lint with auto-fix:
```bash
npm run lint:fix
```

## Network Configuration

- **Test gateway**: `https://gateway.testnet2.unicity.network`. It fronts a sharded aggregator, so a
  plain `AggregatorClient` pointed at that one URL is enough. `certification_request` requires an API
  key (`AggregatorClient`'s second argument); reading inclusion proofs does not.
- **Trust base**: network-specific, and the network the SDK mints on is taken from it
  (`trustBase.networkId`), so the trust base and the gateway must belong to the same network.
- **Network identifiers**: `NetworkId.MAINNET`, `NetworkId.TESTNET` and `NetworkId.LOCAL` are the
  named constants; any other id a trust base carries resolves through `NetworkId.fromId()`.
- **Token type**: caller-supplied; use `TokenType.generate()` or construct from explicit bytes

## Unicity Signature Standard

The Unicity Network uses a standardized signature format to ensure data integrity and cryptographic proof of ownership. All cryptographic operations use the **`secp256k1`** elliptic curve, **SHA-256** hashing, and **33-byte compressed public keys**.

The standard is designed for efficiency and broad compatibility across different programming environments, including Node.js, browsers, and Go.

### Signature Format

A Unicity signature is a **65-byte** array, structured as the concatenation of three components: `[R || S || V]`.

| Component    | Size (bytes) | Offset | Description                                                                                                   |
| :----------- | :------------- | :----- | :------------------------------------------------------------------------------------------------------------ |
| **R**        | 32             | 0      | The `R` value of the ECDSA signature.                                                                         |
| **S**        | 32             | 32     | The `S` value of the ECDSA signature.                                                                         |
| **V**        | 1              | 64     | The **recovery ID** (`0` or `1`). This value allows for the recovery of the public key directly from the signature. |

### Process Overview

**1. Signing**
The raw message data is first hashed using **SHA-256**. The resulting 32-byte hash is then signed using the signer's 32-byte `secp256k1` private key to produce the 65-byte signature.

**2. Verification**
The verifier hashes the original message using **SHA-256**. Using this hash and the signature, the verifier recovers the public key. The recovered key is then serialized into the compressed format and compared byte-for-byte against the expected **33-byte compressed public key** to confirm validity.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk-js)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk-js/issues)
- **Gateway API**: `https://gateway.testnet2.unicity.network`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.

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

- `genesis`: a `CertifiedMintTransaction` (a `MintTransaction` plus its `InclusionProof`). The mint transaction carries `networkId`, `tokenId`, `tokenType`, `salt`, `recipient`, optional `justification`, optional `data`, and `expiresAt`, an exclusive request deadline in Unix seconds that is `null` when the Unicity Service assigns the deadline instead.
- `transactions`: an ordered list of `CertifiedTransferTransaction` entries, each wrapping a `TransferTransaction` (recipient, state mask, optional data, and `expiresAt`) with its `InclusionProof`.

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

#### Request deadlines are enforced by the service, not by verification

A request may carry an exclusive deadline (`expiresAt`), and the Unicity Service
only admits it to a round whose reference time is strictly below that deadline.
Verification re-checks the deadline against the reference time the leaf reports,
and rejects a leaf claiming to postdate the round that certified it.

Neither check establishes *when* the leaf was created. The reference time is
chosen by the service, and the inclusion proof authenticates the value it chose
rather than the moment it chose it: a service that receives a request after its
deadline can insert the leaf later and record a pre-deadline reference time in
it, and every client-side check still passes. Closing that would need signed
evidence of the creation round, which an inclusion proof does not currently
carry.

So treat `expiresAt` as an instruction to an honest service — the guarantee that
a late request is dropped rather than executed — and not as something a verifier
can prove after the fact. It is not a defence against a service that is itself
dishonest; that case is covered by consensus over the aggregator, not by this
field.

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

Run the integration suite. It talks to a real aggregator, but owns the one it
talks to: Testcontainers starts the stack in
[`tests/integration/docker`](./tests/integration/docker) — a BFT root node,
mongodb, redis and a pinned aggregator build — waits for consensus to certify a
round, and tears it down afterwards. Nothing external is involved, and no setup
is needed:

```bash
npm run test:integration
```

That pays a cold start of roughly a minute per run. While iterating, start the
stack once and point the suite at it — it reuses a stack it did not start, and
leaves it running:

```bash
npm run integration:up
eval "$(./scripts/integration-aggregator.sh env)"
npm run test:integration   # ~20s
npm run integration:down
```

This is where the wire formats get checked. Certification data, the transaction
encodings, the inclusion proof and the reference-time-bound leaf value are all
shared with the service, and the fake aggregator in `tests/functional` derives
them with the very code under test — only a real service can tell whether the
two still agree.

Run the end-to-end suite against a deployed network. Unlike the integration
suite this one has no service of its own, so point it at an endpoint and supply
the matching trust base:

```bash
AGGREGATOR_URL=https://gateway.testnet2.unicity.network \
TRUST_BASE_PATH=/path/to/trust-base.json \
AGGREGATOR_API_KEY=<key, if the endpoint requires one> \
npm run test:e2e
```

The integration suite runs in CI; the e2e suite does not, since it needs a live
network to be pointed at.

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

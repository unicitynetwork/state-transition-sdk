# State Transition SDK

Generic State Transition Flow engine for value-carrier agents on the Unicity Network.

## Overview

The State Transition SDK is a TypeScript library that provides an off-chain token transaction framework. Tokens are managed, stored, and transferred off-chain with only cryptographic commitments published on-chain, ensuring privacy while preventing double-spending through single-spend proofs.

In this system, tokens are self-contained entities containing complete transaction history and cryptographic proofs attesting to their current state (ownership, value, etc.). State transitions are verified through consultation with blockchain infrastructure (Unicity) to produce proof of single spend.

### Key Features

- **Off-chain Privacy**: Cryptographic commitments contain no information about tokens, their state, or transaction nature
- **Horizontal Scalability**: Millions of transaction commitments per block capability  
- **Zero-Knowledge Transactions**: Observers cannot determine if commitments refer to token transactions or other processes
- **TypeScript Support**: Full type safety and modern development experience
- **Modular Architecture**: Pluggable address schemes, predicates, and token types

## Installation

```bash
npm install @unicitylabs/state-transition-sdk
```

## Quick Start

### Basic Usage

Minting
```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

const commitment = await client.submitMintTransaction(/* mint parameters */);
// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const mintTransaction = await client.createTransaction(commitment, inclusionProof);

// Create token from transaction
const token = new Token(
  data.tokenId,
  data.tokenType,
  data.tokenData,
  data.coinData,
  await TokenState.create(data.predicate, data.data),
  [mintTransaction],
);
```

Transfer
```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

// Transfer token to recipient
const commitment = await client.submitTransaction(/* transfer parameters */);
// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const transaction = await client.createTransaction(commitment, inclusionProof);

// Recipient takes transaction and finishes it
await client.finishTransaction(/* transaction parameters */);
```

## Core Components

### StateTransitionClient

The main SDK interface for token operations:

- `submitMintTransaction()` - Create mint commitment
- `submitTransaction()` - Create transfer commitment
- `createTransaction()` - Create transactions from commitments
- `finishTransaction()` - Complete token transfers
- `getTokenStatus()` - Check token status via inclusion proofs

### Address System

**DirectAddress**: Cryptographic addresses with checksums for immediate ownership

To use address sent by someone:
```typescript
const address = await DirectAddress.fromJSON('DIRECT://582200004d8489e2b1244335ad8784a23826228e653658a2ecdb0abc17baa143f4fe560d9c81365b');
```

To use address for minting or to send it someone, reference from predicate is needed:
```typescript
const address = await DirectAddress.create(MaskedPredicate.calculateReference(/* Reference parameters */));
```

### Predicate System

Predicates define unlock conditions for tokens:

- **UnmaskedPredicate**: Direct public key ownership
- **MaskedPredicate**: Privacy-preserving ownership (hides public keys)
- **BurnPredicate**: One-way predicate for token destruction

```typescript
// Create an unmasked predicate for direct ownership
const unmaskedPredicate = UnmaskedPredicate.create(token.id, token.type, signingService, HashAlgorithm.SHA256, salt);

// Create a masked predicate for privacy
const maskedPredicate = await MaskedPredicate.create(
  token.id,
  token.type,
  signingService,
  HashAlgorithm.SHA256,
  nonce,
);
```

### Token Types

**Fungible Tokens**: Standard value-bearing tokens
```typescript
const tokenData = new TokenCoinData([
  { coinId: CoinId.ALPHA_COIN, value: BigInt(1000) }
]);
```

### Transaction Flow

1. **Minting**: Create new tokens
2. **Transfer**: Submit state transitions between owners
3. **Completion**: Finalize transfers with new token state

#### Transfer flow

Prerequisites
Recipient knows some info about token, like token type for generating address.

```text
A[Start] 
A --> B[Recipient Generates Address]
B --> C[Recipient Shares Address with Sender]
C --> D[Sender Submits Transaction Commitment]
D --> E[Sender Retrieves Inclusion Proof]
E --> F[Sender Creates Transaction]
F --> G[Sender Sends Transaction and Token to Recipient]
G --> H[Recipient Imports Token and Transaction]
H --> I[Recipient Verifies Transaction]
I --> J[Recipient Finishes Transaction]
J --> K[End]
```


## Architecture

### Token Structure
Tokens contain:
- **tokenId**: Unique 256-bit identifier
- **tokenType**: Token class identifier
- **predicate**: Current ownership condition
- **data**: Token-specific data (value for fungible, name-tag for addressing)

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

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Network Configuration

- **Test Gateway**: `https://gateway-test1.unicity.network:443`
- **Default Token Type**: Configurable via TokenType enum

## Examples

### Minting Tokens
```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

const commitment = await client.submitMintTransaction(/* mint parameters */);
// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const mintTransaction = await client.createTransaction(commitment, inclusionProof);

// Create token from transaction
const token = new Token(
  data.tokenId,
  data.tokenType,
  data.tokenData,
  data.coinData,
  await TokenState.create(data.predicate, data.data),
  [mintTransaction],
);
```

### Token Transfer
```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

// Transfer token to recipient
const commitment = await client.submitTransaction(/* transfer parameters */);
// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const transaction = await client.createTransaction(commitment, inclusionProof);
```

### Receiving tokens
```typescript
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

const importedToken = await new TokenFactory(new PredicateFactory()).create(/* Token JSON */, TestTokenData.fromJSON);
// Recipient gets transaction from sender
const importedTransaction = await Transaction.fromJSON(
  importedToken.id,
  importedToken.type,
  /* transaction JSON */,
  new PredicateFactory(),
);

// Finish the transaction with the recipient predicate
const updateToken = await client.finishTransaction(
  importedToken,
  /* current token state */
  importedTransaction,
);
```

### Checking Token Status
```typescript
const status = await client.getTokenStatus(token);
/* 
  status InclusionProofVerificationStatus.OK is spent
  status InclusionProofVerificationStatus.PATH_NOT_INCLUDED is unspent
 */
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)
- **Gateway API**: `https://gateway-test1.unicity.network:443`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.
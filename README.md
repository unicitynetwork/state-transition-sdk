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

```typescript
import { 
  StateTransitionClient, 
  AggregatorClient, 
  Token, 
  TokenType,
  DirectAddress,
  UnmaskedPredicate 
} from '@unicitylabs/state-transition-sdk';

// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test1.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

// Mint a new token
const mintData = await client.submitMintTransaction(/* mint parameters */);

// Transfer token to recipient
const transaction = await client.submitTransaction(/* transfer parameters */);
```

## Core Components

### StateTransitionClient

The main SDK interface for token operations:

- `submitMintTransaction()` - Create new tokens
- `submitTransaction()` - Submit state transitions
- `createTransaction()` - Create transactions from commitments
- `finishTransaction()` - Complete token transfers
- `getTokenStatus()` - Check token status via inclusion proofs

### Address System

**DirectAddress**: Cryptographic addresses with checksums for immediate ownership
```typescript
const address = new DirectAddress(publicKey, checksum);
```

**NameTagAddress**: Proxy addresses for indirect addressing
```typescript
const address = new NameTagAddress(nameTag);
```

### Predicate System

Predicates define unlock conditions for tokens:

- **UnmaskedPredicate**: Direct public key ownership
- **MaskedPredicate**: Privacy-preserving ownership (hides public keys)
- **BurnPredicate**: One-way predicate for token destruction

```typescript
// Create an unmasked predicate for direct ownership
const predicate = new UnmaskedPredicate(publicKey, signature);

// Create a masked predicate for privacy
const predicate = new MaskedPredicate(hashedPublicKey, commitment);
```

### Token Types

**Fungible Tokens**: Standard value-bearing tokens
```typescript
const tokenData = new TokenCoinData([
  { coinId: CoinId.ALPHA_COIN, value: BigInt(1000) }
]);
```

**Name-Tag Tokens**: Special tokens for name-tag addressing
```typescript
const token = new NameTagToken(tokenId, tokenType, predicate, nameTagData);
```

### Transaction Flow

1. **Minting**: Create new tokens with universal minter secret
2. **Transfer**: Submit state transitions between owners
3. **Completion**: Finalize transfers with new token state

```typescript
// Complete transfer flow
const commitment = await client.submitMintTransaction(mintData);
const proof = await client.getInclusionProof(commitment);
const transaction = await client.createTransaction(commitment, proof);
const newToken = await client.finishTransaction(transaction, newPredicate);
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

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
// All classes and interfaces are fully typed
interface IAddress {
  getAddressScheme(): AddressScheme;
  toString(): string;
}

// Compile-time safety for token operations
class Token implements ISerializable {
  // Type-safe token operations
}
```

## Examples

### Minting Tokens
```typescript
const mintData = new MintTransactionData(
  tokenId,
  tokenType, 
  ownerPredicate,
  tokenData
);

const commitment = await client.submitMintTransaction(mintData);
```

### Token Transfer
```typescript
const transaction = await client.submitTransaction(
  sourceToken,
  targetPredicate,
  newTokenData
);
```

### Checking Token Status
```typescript
const status = await client.getTokenStatus(token);
console.log(`Token is ${status.isSpent ? 'spent' : 'unspent'}`);
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)
- **Gateway API**: `https://gateway-test1.unicity.network:443`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.
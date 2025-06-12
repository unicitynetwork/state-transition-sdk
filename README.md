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
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
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
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

// Transfer token to recipient
const commitment = await client.submitTransaction(/* transfer parameters */);
// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const transaction = await client.createTransaction(commitment, inclusionProof);

// Recipient takes transaction and finishes it
await client.finishTransaction(/* transaction parameters */);
```

### Browser Usage

When used in a browser environment, hashing automatically falls back to the Web
Crypto API. Use `createDefaultDataHasherFactory()` when constructing prefix hash
trees:

```typescript
import { createDefaultDataHasherFactory } from '@unicitylabs/state-transition-sdk';

const hasherFactory = createDefaultDataHasherFactory();
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
  nonce
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

Run unit and integrations tests.
NB! Integration tests require docker to be installed.

```bash
npm test
```

Run unit tests only.

```bash
npm run test:unit
```

Run integration tests only.

```bash
npm run test:integration
```

Run end-to-end tests only.

```bash
AGGREGATOR_URL='https://aggregator.devnet.alphabill.org' npm run test:e2e
```

### Linting

```bash
npm run lint
```

## Network Configuration

- **Test Gateway**: `https://gateway-test.unicity.network:443`
- **Default Token Type**: Configurable via TokenType enum

## Examples

### Minting Tokens

Note that the examples here are using some utility functions and classes that are defined below in a separate section.

```typescript
// In real usage, this secret must be persisted in order to keep access to your tokens
// This secret belongs to the minter and like all secrets, should be kept private
const initialOwnerSecret = crypto.getRandomValues(new Uint8Array(32));

// Connect to the testnet
const client = new StateTransitionClient(new AggregatorClient('https://gateway-test.unicity.network:443'));

// Using randomized coin IDs and amounts here for testing purposes.
// We mint 2 different coins.
const data = await createMintData(
  initialOwnerSecret,
  new TokenCoinData([
    [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
  ]),
);

const mintCommitment = await client.submitMintTransaction(
  await DirectAddress.create(data.predicate.reference),
  data.tokenId,
  data.tokenType,
  data.tokenData,
  data.coinData,
  data.salt,
  await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest(),
  null
);

const mintTransaction = await client.createTransaction(
  mintCommitment,
  await waitInclusionProof(client, mintCommitment),
);

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

This example begins after the previous example: here we assume that the tokens have already been minted and we wish to send the tokens to a new recipient.

Note that the examples here are using some utility functions and classes that are defined below in a separate section.

```typescript
// This secret belongs to the receiver that the token is sent to 
const receiverSecret = crypto.getRandomValues(new Uint8Array(32));

// Recipient prepares the info for the transfer using token ID and type from the sender.
const nonce = crypto.getRandomValues(new Uint8Array(32));
const receiverSigningService = await SigningService.createFromSecret(receiverSecret, nonce);
const recipientPredicate = await MaskedPredicate.create(
  token.id,
  token.type,
  receiverSigningService,
  HashAlgorithm.SHA256,
  nonce,
);

const recipient = await DirectAddress.create(recipientPredicate.reference);

// The sender creates the transfer transaction, using recipientPredicate.reference sent by the receiver
const salt = crypto.getRandomValues(new Uint8Array(32));
const transactionData = await TransactionData.create(
  token.state,
  recipient.toJSON(),
  salt,
  await new DataHasher(HashAlgorithm.SHA256).update(new TextEncoder().encode('my custom data')).digest(),
  new TextEncoder().encode('my message'),
  token.nametagTokens,
);

const commitment = await client.submitTransaction(
  transactionData, 
  await SigningService.createFromSecret(initialOwnerSecret, data.nonce));

const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

// The sender serializes the resulting transaction and sends it to the receiver
const sendingTransactionJson = transaction.toJSON() as ITransactionJson<ITransactionDataJson>;

// The sender also serializes the token into JSON and sends it to the receiver
const tokenAsJson = token.toJSON();

// The receiver imports the token from the given JSON file 
const tokenFactory = new TokenFactory(new PredicateFactory());
const importedToken = await tokenFactory.create(tokenAsJson, TestTokenData.fromJSON);

// Recipient gets transaction from sender
const importedTransaction = await Transaction.fromJSON(
  importedToken.id,
  importedToken.type,
  sendingTransactionJson,
  new PredicateFactory(),
);

// The receipient finishes the transaction with the recipient predicate
const updateToken = await client.finishTransaction(
  importedToken,
  await TokenState.create(recipientPredicate, new TextEncoder().encode('my custom data')),
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

### The Token Split Operation

```typescript
const client = new StateTransitionClient(new AggregatorClient('https://gateway-test.unicity.network:443'));

// First, let's mint a token in the usual way.
const sumTreeHasherFactory = new DataHasherFactory(NodeDataHasher);
const sumTreeHashAlgorithm = HashAlgorithm.SHA256;

const secret = new TextEncoder().encode('secret');

const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

const coinData = new TokenCoinData([
  [unicityToken, 10n],
  [alphaToken, 20n],
]);
const mintTokenData = await createMintData(secret, coinData);
const mintCommitment = await client.submitMintTransaction(
  await DirectAddress.create(mintTokenData.predicate.reference),
  mintTokenData.tokenId,
  mintTokenData.tokenType,
  mintTokenData.tokenData,
  mintTokenData.coinData,
  mintTokenData.salt,
  await new DataHasher(HashAlgorithm.SHA256).update(mintTokenData.data).digest(),
  null,
);

const mintTransaction = await client.createTransaction(
  mintCommitment,
  await waitInclusionProof(client, mintCommitment),
);

const token = new Token(
  mintTokenData.tokenId,
  mintTokenData.tokenType,
  mintTokenData.tokenData,
  mintTokenData.coinData,
  await TokenState.create(mintTokenData.predicate, mintTokenData.data),
  [mintTransaction],
);

// Now let's split that token into 2 tokens.

const coinsPerNewTokens = [
  new TokenCoinData([
    [unicityToken, 10n],
    [alphaToken, 5n],
  ]),
  new TokenCoinData([[alphaToken, 15n]]),
];

const { commitment, recipientPredicate, newTokenIds, allCoinsTree, coinTrees } =
  await client.submitBurnTransactionForSplit(
    token,
    coinsPerNewTokens,
    sumTreeHasherFactory,
    sumTreeHashAlgorithm,
    secret,
    mintTokenData.nonce,
    await new DataHasher(HashAlgorithm.SHA256).update(new TextEncoder().encode('my custom data')).digest(),
    new TextEncoder().encode('my message'),
  );

const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

const updatedToken = await client.finishTransaction(
  token,
  await TokenState.create(recipientPredicate, new TextEncoder().encode('my custom data')),
  transaction,
);

const splitTokenData: IMintData[] = await Promise.all(
  coinsPerNewTokens.map(
    async (tokenCoinData, index) =>
      await createMintTokenDataForSplit(newTokenIds[index], secret, mintTokenData.tokenType, tokenCoinData),
  ),
);

const splitTokens = await Promise.all(
  splitTokenData.map(async (tokenData) => {
    const burnProofs: Map<string, [Path, SumPath]> = new Map();
    for (const [coinId] of tokenData.coinData.coins) {
      const pathToCoinTree = await allCoinsTree.getProof(
        BigintConverter.decode(HexConverter.decode(coinId.toJSON())),
      );
      const pathToCoinAmount = await coinTrees
        .get(coinId.toJSON())!
        .getProof(BigintConverter.decode(HexConverter.decode(tokenData.tokenId.toJSON())));
      burnProofs.set(coinId.toJSON(), [pathToCoinTree, pathToCoinAmount]);
    }

    const mintCommitment = await client.submitMintTransaction(
      await DirectAddress.create(tokenData.predicate.reference),
      tokenData.tokenId,
      tokenData.tokenType,
      tokenData.tokenData,
      tokenData.coinData,
      tokenData.salt,
      await new DataHasher(HashAlgorithm.SHA256).update(tokenData.data).digest(),
      new SplitProof(updatedToken, burnProofs),
    );
    const mintTransaction = await client.createTransaction(
      mintCommitment,
      await waitInclusionProof(client, mintCommitment),
    );
    return new Token(
      tokenData.tokenId,
      tokenData.tokenType,
      tokenData.tokenData,
      tokenData.coinData,
      await TokenState.create(tokenData.predicate, tokenData.data),
      [mintTransaction],
    );
  }),
);

async function createMintTokenDataForSplit(
  tokenId: TokenId,
  secret: Uint8Array,
  tokenType: TokenType,
  coinData: TokenCoinData,
): Promise<IMintData> {
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const signingService = await SigningService.createFromSecret(secret, nonce);
  const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}
```

### Utility methods and classes 

The above code examples are using utility methods and classes, included here:

```typescript
async function createMintData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintData> {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const predicate = await MaskedPredicate.create(
    tokenId,
    tokenType,
    await SigningService.createFromSecret(secret, nonce),
    HashAlgorithm.SHA256,
    nonce,
  );

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

class TestTokenData implements ISerializable {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public static fromJSON(data: unknown): Promise<TestTokenData> {
    if (typeof data !== 'string') {
      throw new Error('Invalid test token data');
    }

    return Promise.resolve(new TestTokenData(HexConverter.decode(data)));
  }

  public toJSON(): string {
    return HexConverter.encode(this._data);
  }

  public toCBOR(): Uint8Array {
    return this.data;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      TestTokenData: ${HexConverter.encode(this.data)}`;
  }
}

async function waitInclusionProof(
  client: StateTransitionClient,
  commitment: Commitment<TransactionData | MintTransactionData<ISerializable | null>>,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  while (true) {
    try {
      const inclusionProof = await client.getInclusionProof(commitment);
      if ((await inclusionProof.verify(commitment.requestId.toBigInt())) === InclusionProofVerificationStatus.OK) {
        return inclusionProof;
      }
    } catch (err) {
      if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
        throw err;
      }
    }

    try {
      await sleep(interval, signal);
    } catch (err) {
      throw new Error(String(err || 'Sleep was aborted'));
    }
  }
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function sendToken(
  client: StateTransitionClient,
  token: Token<ISerializable, MintTransactionData<ISerializable | null>>,
  signingService: SigningService,
  recipient: DirectAddress,
): Promise<Transaction<TransactionData>> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const transactionData = await TransactionData.create(
    token.state,
    recipient.toJSON(),
    salt,
    await new DataHasher(HashAlgorithm.SHA256).update(new TextEncoder().encode('my custom data')).digest(),
    new TextEncoder().encode('my message'),
    token.nametagTokens,
  );

  const commitment = await client.submitTransaction(transactionData, signingService);
  return await client.createTransaction(commitment, await waitInclusionProof(client, commitment));
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)
- **Gateway API**: `https://gateway-test.unicity.network:443`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.
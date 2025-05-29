# Unicity State Transition SDK

A comprehensive TypeScript/JavaScript SDK for building applications on the Unicity network's off-chain token transaction framework. This SDK enables developers to mint, transfer, and manage tokens using Unicity's innovative single-spend proof system that provides blockchain security with off-chain scalability.

## Overview

The Unicity State Transition SDK implements an off-chain token management paradigm where:

- **Tokens are managed off-chain** - Stored and transferred on users' premises or in cloud infrastructure, outside of blockchain ledgers
- **Single-spend proofs are generated on-chain** - Only cryptographic commitments are submitted to the Unicity blockchain
- **Privacy-preserving** - Transaction commitments contain no information about tokens, states, or transaction nature
- **Horizontally scalable** - Capable of accommodating millions of transaction commitments per block

## Key Concepts

### Tokens
Self-contained entities that include all information and cryptographic proofs attesting to their current state (ownership, value, etc.). Each token contains:

- **tokenId**: Unique 256-bit identifier
- **tokenClass**: Token type identifier (similar to ERC-20 contract addresses)
- **tokenValue**: Numeric value represented as big integer
- **Genesis**: Minting-related proofs and data
- **Transitions**: History of state changes with proofs
- **State**: Current ownership and challenge information

### State Transitions
Records that define how a token state changes, including:
- Proofs unlocking the source state challenge
- Unicity single-spend proof
- Cryptographic salt for privacy

### Transactions vs Transitions
- **Transaction**: Created by sender, contains source state and recipient pointer
- **Transition**: Resolved by recipient, contains full source and destination states

## Web GUI interface
[Token GUI stand-alone page](https://unicitynetwork.github.io/state-transition-sdk/)

## Installation

```bash
npm install @unicity/state-transition-sdk
```

### From Source

```bash
git clone --recurse-submodules https://github.com/unicitynetwork/state-transition-sdk.git
cd state-transition-sdk
npm install
npm run build
```

## Quick Start

### 1. Import the SDK

```javascript
import { StateMachine, Helper } from '@unicity/state-transition-sdk';
```

### 2. Mint a New Token

```javascript
const secret = "your-secret-password";
const tokenClass = "unicity_test_coin";
const tokenValue = "1000000000000000000"; // 1 token with 18 decimals

// Mint a new token
const tokenFlow = await StateMachine.mint({
  tokenClass,
  tokenValue,
  secret
});

console.log("Token minted:", tokenFlow.token.tokenId);
```

### 3. Generate Recipient Pointer

```javascript
// Recipient generates a pointer to receive tokens
const recipientSecret = "recipient-secret";
const nonce = Helper.generateNonce();

const pointer = Helper.calculatePointer({
  tokenClass,
  secret: recipientSecret,
  nonce
});

console.log("Share this pointer with sender:", pointer);
console.log("Keep this nonce secret:", nonce);
```

### 4. Send a Token

```javascript
// Sender creates transaction
const transaction = await StateMachine.createTx({
  token: tokenFlow.token,
  destPointer: pointer,
  secret: senderSecret
});

// Export for sharing with recipient
const exportedFlow = StateMachine.exportFlow(transaction);
```

### 5. Receive a Token

```javascript
// Recipient resolves transaction
const receivedFlow = await StateMachine.importFlow({
  flowData: exportedFlow,
  nonce: recipientNonce,
  secret: recipientSecret
});

console.log("Token received! New owner:", receivedFlow.token.state.challenge.pubkey);
```

## API Reference

### StateMachine

Core functionality for token lifecycle management.

#### `mint(options)`
Creates a new token with Unicity certificate proving single mint.

```javascript
const result = await StateMachine.mint({
  tokenClass: "string",    // Token type identifier
  tokenValue: "string",    // Token value as string
  secret: "string",        // User secret for key derivation
  tokenId?: "string",      // Optional custom token ID
  nonce?: "string"         // Optional custom nonce
});
```

#### `createTx(options)`
Generates transaction structure and obtains single-spend proof.

```javascript
const transaction = await StateMachine.createTx({
  token: Token,           // Token object to spend
  destPointer: "string",  // Recipient's pointer
  secret: "string",       // Sender's secret
  salt?: "string"         // Optional custom salt
});
```

#### `importFlow(options)`
Imports and processes token flow, resolving transactions if present.

```javascript
const processed = await StateMachine.importFlow({
  flowData: "string",     // JSON flow data
  nonce?: "string",       // Recipient nonce (if receiving)
  secret?: "string"       // User secret (if receiving)
});
```

#### `exportFlow(tokenOrTransaction)`
Exports token/transaction as JSON string for sharing.

```javascript
const jsonFlow = StateMachine.exportFlow(tokenData);
```

#### `getTokenStatus(options)`
Checks token ownership and spend status against Unicity network.

```javascript
const status = await StateMachine.getTokenStatus({
  token: Token,
  secret: "string"
});
```

#### `collectTokens(options)`
Scans tokens and filters unspent ones for a given user.

```javascript
const ownedTokens = await StateMachine.collectTokens({
  tokens: Token[],
  secret: "string"
});
```

### Helper

Utility functions for cryptographic operations and data manipulation.

#### `calculatePointer(options)`
Derives recipient pointer for privacy-preserving transfers.

```javascript
const pointer = Helper.calculatePointer({
  tokenClass: "string",
  secret: "string",
  nonce: "string"
});
```

#### `generateNonce()`
Generates cryptographically secure random nonce.

```javascript
const nonce = Helper.generateNonce();
```

## Command Line Interface

The SDK includes a comprehensive CLI tool for token management.

### Token Manager

```bash
# Mint a new token
./token_manager.js mint --tokenClass="my_token" --tokenValue="1000000000000000000" --secret="my_secret"

# Generate recipient pointer
./token_manager.js pointer --tokenClass="my_token" --secret="recipient_secret" --nonce="123456"

# Send token to recipient
echo '{"token":...}' | ./token_manager.js send --destPointer="abc123..." --secret="sender_secret"

# Receive token
echo '{"token":..., "transaction":...}' | ./token_manager.js receive --nonce="123456" --secret="recipient_secret"

# Check balance
./token_manager.js summary --secret="my_secret" < token_files.json
```

### Bash Scripts

Convenient wrapper scripts for common operations:

```bash
# In cli/ directory
./mint.sh      # Interactive token minting
./pointer.sh   # Generate recipient pointer
./send.sh      # Send token to recipient
./receive.sh   # Receive and process token
./summarize.sh # Check token balance
```

## Token Flow Example

Here's a complete example of the token lifecycle:

```javascript
import { StateMachine, Helper } from '@unicity/state-transition-sdk';

async function completeTokenFlow() {
  const senderSecret = "alice_secret";
  const recipientSecret = "bob_secret";
  const tokenClass = "example_coin";
  
  // 1. Alice mints a token
  console.log("1. Minting token...");
  const mintResult = await StateMachine.mint({
    tokenClass,
    tokenValue: "5000000000000000000", // 5 tokens
    secret: senderSecret
  });
  
  // 2. Bob generates pointer
  console.log("2. Generating recipient pointer...");
  const bobNonce = Helper.generateNonce();
  const bobPointer = Helper.calculatePointer({
    tokenClass,
    secret: recipientSecret,
    nonce: bobNonce
  });
  
  // 3. Alice sends token to Bob
  console.log("3. Creating transaction...");
  const transaction = await StateMachine.createTx({
    token: mintResult.token,
    destPointer: bobPointer,
    secret: senderSecret
  });
  
  // 4. Alice exports flow for Bob
  const exportedFlow = StateMachine.exportFlow(transaction);
  
  // 5. Bob receives and imports the token
  console.log("4. Receiving token...");
  const bobResult = await StateMachine.importFlow({
    flowData: exportedFlow,
    nonce: bobNonce,
    secret: recipientSecret
  });
  
  // 6. Verify Bob owns the token
  const bobStatus = await StateMachine.getTokenStatus({
    token: bobResult.token,
    secret: recipientSecret
  });
  
  console.log("Transfer complete! Bob's token status:", bobStatus);
}
```

## Privacy Features

### State Obfuscation
- Token states are obfuscated with random nonces
- Observers cannot determine token IDs, classes, or owner keys from network traffic
- Commitments are indistinguishable from other types of data

### One-time Key Usage
- Public keys are derived from user secrets and one-time nonces
- Users can access tokens through seemingly unrelated key pairs
- Prevents linking transactions to specific identities

### Zero-Knowledge Commitments
- Only commitment hashes are submitted to Unicity network
- No transaction details, amounts, or parties are revealed
- Maintains privacy while ensuring double-spend prevention

## Security Considerations

### Key Management
- Store user secrets securely (use hardware wallets, secure enclaves)
- Never share nonces used for receiving tokens
- Rotate secrets regularly for enhanced security

### Token Storage
- Token files can be safely stored on public media when encrypted
- Always backup token JSON files before operations
- Verify token status before attempting transfers

### Network Security
- All communications with Unicity gateway use HTTPS
- Implement proper error handling for network failures
- Validate all inputs and outputs

## Error Handling

```javascript
try {
  const result = await StateMachine.mint({
    tokenClass: "test_coin",
    tokenValue: "1000000000000000000",
    secret: "my_secret"
  });
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    console.log("Network connection failed, retry later");
  } else if (error.code === 'INVALID_PROOF') {
    console.log("Cryptographic proof validation failed");
  } else {
    console.log("Unexpected error:", error.message);
  }
}
```

## Configuration

### Gateway Configuration
The SDK connects to Unicity gateway at `https://gateway-test1.unicity.network:443` by default.

```javascript
// Configure custom gateway
StateMachine.configure({
  gatewayUrl: "https://your-gateway.unicity.network:443",
  timeout: 30000,
  retries: 3
});
```

### Token Classes
Define custom token classes for your application:

```javascript
const myTokenClass = "4f2d8a7b9c1e6d3a8f5b2e9c7a1d4f8e6b3c9a2d5f8e1b4c7a9d2f5e8b1c4a7";
```

## Development and Testing

### Running Tests
```bash
npm test
```

### Building from Source
```bash
npm run build
```

## Support and Resources

- **Gateway API**: `https://gateway-test1.unicity.network:443`
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.

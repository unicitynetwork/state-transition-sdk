# State Transition SDK

Generic State Transition Flow engine for value-carrier agents on the Unicity Network.

## Overview

The State Transition SDK is an off-chain token transaction framework that follows a paradigm where tokens are managed, stored, and transferred off-chain (on users' premises or in cloud, outside of the blockchain ledger) with only single-spend proofs generated on-chain.

In this system, a token is a stand-alone entity containing all information and cryptographic proofs attesting to the current token's state (ownership, value, etc.). Token state changes are accompanied by consulting with the blockchain infrastructure (Unicity) to produce proof of single spend, ensuring no double-spending occurs.

### Key Features

- **Off-chain Privacy**: Cryptographic commitments contain no information about the token, its state, or transaction nature
- **Horizontal Scalability**: Millions of transaction commitments per block capability
- **Zero-Knowledge Transactions**: Observers cannot determine if commitments refer to token transactions or other processes
- **Distributed Hash Tree**: All transaction commitments are aggregated into a global distributed hash tree rooted in the Unicity blockchain

## Web GUI Token Manager

A user-friendly web interface is available at: **https://unicitynetwork.github.io/state-transition-sdk/**

### Web GUI Features

The web interface provides three main panels for token management:

#### Left Panel - Token State Display
- Token ID, Class, Public Key, Nonce, Value
- Token status checking with "Check" button
- Real-time token state information

#### Central Panel - Token Data & Secret Management
- Secret field for password-based token locking/unlocking
- Token data display and hash verification
- JSON document view for complete token information

#### Right Panel - Token Actions
- **New**: Mint new tokens
- **Import**: Import received tokens
- **Send**: Transfer tokens to recipients
- **Generate Pointer/Nonce**: Create recipient addresses

### Quick Start with Web GUI

#### Minting a New Token
1. Set password in "Secret" field (central panel)
2. Set token type (default: `unicity_test_coin`) in right panel
3. Set token value (default: `1000000000000000000`) in right panel
4. Click "New" button and wait for Unicity certificate from gateway
5. Token JSON will populate central field, token info appears in left panel

#### Sending Tokens
1. Recipient generates pointer using "Generate Pointer/Nonce" button
2. Recipient shares pointer with sender (keeps nonce private)
3. Sender sets password in "Secret" field
4. Sender enters recipient's pointer below "Send" button
5. Click "Send" and wait for transaction to complete
6. Share updated JSON document with recipient

#### Receiving Tokens
1. Set password in "Secret" field (central panel)
2. Enter saved nonce in field below "Import" button
3. Paste received token JSON into central field
4. Click "Import" button and wait for status update to "Spendable"

## Installation & Setup

### Prerequisites
- Node.js and npm installed
- Git for cloning the repository

### Installation Steps

```bash
# Clone the repository with submodules
git clone --recurse-submodules https://github.com/unicitynetwork/state-transition-sdk.git

# Navigate to project directory
cd state-transition-sdk

# Install dependencies
npm install

# Navigate to aggregators_net subfolder and install dependencies
cd aggregators_net
npm install
```

### Building for Distribution

```bash
# Build TypeScript to lib directory
npm run build

# Publish to npm (if you have publishing rights)
npm publish
```

## SDK Components

### Core Libraries

#### `state_machine.js`
Main SDK library with core functions:

- **`mint`**: Creates token structure and generates Unicity certificate for single mint proof
- **`createTx`**: Generates transaction structure and single-spend proof
- **`exportFlow`**: Exports token and transaction as JSON object
- **`importFlow`**: Imports token/transaction from JSON, resolves transactions into transitions
- **`getTokenStatus`**: Probes current token state and spend status via Unicity gateway
- **`collectTokens`**: Scans token sets and filters unspent tokens for given user

#### `helper.js`
Utility functions:

- **`calculatePointer`**: Derives recipient pointer from tokenClass, secret, and nonce

#### `token_manager.js`
Command-line tool for processing transaction flows:

```bash
# Mint new token
./token_manager.js mint [options]

# Generate recipient pointer
./token_manager.js pointer [options]

# Send token to recipient
./token_manager.js send [options]

# Receive and process token
./token_manager.js receive [options]

# Show token balance summary
./token_manager.js summary [options]
```

### CLI Scripts

Located in `./cli/` directory for managing TX flows stored in `./txf/` folder:

#### `mint.sh`
```bash
./mint.sh
# Prompts for: Token ID, Token Class, Token Value, Nonce, User Secret
```

#### `pointer.sh`
```bash
./pointer.sh
# Generates recipient pointer and nonce
```

#### `send.sh`
```bash
./send.sh
# Lists available tokens and creates transaction
```

#### `receive.sh`
```bash
./receive.sh
# Resolves transaction into token ownership transfer
```

#### `summarize.sh`
```bash
./summarize.sh
# Shows balance and owned tokens for a user
```

## Core Concepts

### Token Structure
A token contains:
- **tokenId**: Unique 256-bit identifier
- **tokenClass**: 256-bit code identifying token type/class
- **tokenValue**: Numeric value as big integer (supports 10^18 fractional units)
- **Genesis**: Minting-related proofs and data
- **Transitions**: Sequence of state transitions with Unicity proofs
- **State**: Current token state with public key, nonce, etc.

### Token State
Represents current ownership challenge:
- **tokenId** & **tokenClass**: Token identification
- **pubkey**: Owner's public key
- **nonce**: One-time random value per public key-token pair

### Transactions vs Transitions
- **Transaction**: Created by sender with source state, recipient pointer, and salt
- **Transition**: Resolved by recipient who knows the nonce, containing full source and destination states

### Commitment Structure
Unicity commitments contain:
- **RequestId**: Unique identifier derived from token state
- **Payload**: Transaction digest with random salt
- **Authenticator**: Owner's public key, signature, and obfuscated token state

### Privacy Features
- **State Obfuscation**: Token states hidden using recipient nonces and pointers
- **One-time Keys**: Public keys derived from user secret + random nonce
- **Transaction Salt**: Random values prevent transaction prediction
- **Zero-Knowledge**: Commitments reveal no information about tokens or transactions

## Example Usage

### Complete Token Transfer Flow

```bash
# User1: Mint a token
./cli/mint.sh
# Enter details, save generated .txf file

# User2: Generate pointer
./cli/pointer.sh
# Share pointer with User1, keep nonce private

# User1: Send token
./cli/send.sh
# Select token file, enter User2's pointer
# Share updated .txf file with User2

# User2: Receive token
./cli/receive.sh
# Enter nonce and secret to claim ownership

# User2: Check balance
./cli/summarize.sh
# View all owned tokens and total balance
```

## Network Configuration

- **Test Gateway**: `https://gateway-test1.unicity.network:443`
- **Default Token Class**: `unicity_test_coin`
- **Default Token Value**: `10000000000000000000` (10^19 atomic units)

## File Structure

```
state-transition-sdk/
├── state_machine.js     # Core SDK functions
├── helper.js            # Utility functions  
├── token_manager.js     # CLI token management tool
├── cli/                 # Bash scripts for token operations
│   ├── mint.sh          # Mint new tokens
│   ├── pointer.sh       # Generate recipient pointers
│   ├── send.sh          # Send tokens
│   ├── receive.sh       # Receive tokens
│   └── summarize.sh     # Show token balance
├── txf/                 # Transaction flow files storage
├── aggregators_net/     # Network aggregation components
└── lib/                 # Compiled TypeScript output
```

## Security Considerations

- **Private Key Management**: User secrets derive one-time keypairs
- **Nonce Security**: Recipients must keep nonces private until token import
- **File Storage**: TX flow files are safe to store publicly when password-locked
- **Network Privacy**: All communications with Unicity are cryptographically obfuscated

## Support and Resources

- **Gateway API**: `https://gateway-test1.unicity.network:443`
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.

# State Transition SDK

This is an off-chain token transaction framework that follows a paradigm where tokens are managed, stored, and transferred off-chain (on users' premises or in the cloud, outside of the blockchain ledger). Only single-spend proofs are generated on-chain.

## Overview

In this system, a **token** is a standalone entity containing all the information and cryptographic proofs attesting to the token's current state (such as ownership, value, etc.). When a token's state changes, the system consults with the blockchain infrastructure (Unicity) to produce a proof of single spend. This proof is a cryptographically verifiable statement that the given source state has been changed to a new given state, and that there were no other transitions from the source state before.

### Privacy Features

Cryptographic commitments about spent tokens contain no information about:
- The token itself
- Its initial state  
- Its destination state
- The nature of the transaction

This means when someone observes traffic between clients and Unicity infrastructure, it's impossible to determine whether submitted commitments refer to token transactions or completely different processes.

All transaction commitments are aggregated into a global distributed hash tree data structure rooted in the Unicity blockchain. This creates a horizontally scalable, on-demand blockchain infrastructure capable of accommodating millions of transaction commitments per block.

## Web GUI Interface

**Live Demo:** [Token GUI standalone page](https://unicitynetwork.github.io/state-transition-sdk/)

### Minting a Token

1. Set the password to lock the token to be minted (central panel, **Secret** field)
2. Set the token type (or leave default `unicity_test_coin`) in the field under **New** button (right panel)
3. Set the token value (or leave default `1000000000000000000`) in the field below token type
4. Click **New** and wait a few seconds for the single-spend proof (unicity certificate) from the unicity gateway `https://gateway-test1.unicity.network:443`
5. The central text field will populate with a JSON document containing the token, and the left panel will display extracted token info
6. You can click **Check** in the left panel to verify current token status for the given token and password

### Generating a Recipient Pointer

A recipient must generate a pointer to which token ownership will be transferred:

1. Set the password to lock the token you expect to receive (central panel, **Secret** field)
2. Click **Generate Pointer/Nonce** button
3. Share the pointer with the sender
4. Keep the Nonce secret to "import" the token when received

### Sending a Token

1. Set the password to unlock the token for sending (central panel, **Secret** field)
2. Set the pointer obtained from the recipient in the field below **Send** button (right panel)
3. Click **Send** button
4. Wait for the JSON document to update after communicating with the Unicity gateway (verify that the `transaction` field is non-empty)
5. Copy the JSON document and send it to the recipient via any secure means (messenger, email, flash drive, etc.)

### Receiving a Token

When the recipient gets the JSON document containing the token:

1. Set the password to lock the received token (central panel, **Secret** field)
2. Enter the **Nonce** in the field below the **Import** button (right panel)
3. Click **Import** button and wait for the token status on the left panel to update to "Spendable"
4. Congratulations! You have successfully received the token
5. **Important:** Save the JSON document for future use (local disk, cloud, etc.). It's safe to store the password-locked token on public media, though not recommended for confidentiality

## Setup Instructions

```bash
# Clone the project with submodules
git clone --recurse-submodules https://github.com/unicitynetwork/tx-flow-engine.git

# Ensure npm and node are installed
cd tx-flow-engine
npm install

# Install dependencies for aggregators_net
cd aggregators_net
npm install
```

## Publishing the Package

This package is configured to build TypeScript to the `lib` directory when publishing:

```bash
# Build the TypeScript code
npm run build

# Publish to npm
npm publish
```

Only the compiled JavaScript files in the `lib` directory, along with TypeScript declaration files, LICENSE, and README.md are included in the published package.

## Usage

- Use `state_machine.js` and `helper.js` for SDK integration
- Use `token_manager.js` as a generic CLI tool
- Use bash scripts in `./cli` folder to mint, transfer, and receive tokens stored in TXF files as JSON objects

## Core Concepts

### Token

A **token** is an entity holding value and optionally other application-specific data. Depending on the token's use case and currency value, a cryptographic proof of value or asset origin needs to be provided at genesis. In simple examples, it's sufficient to demonstrate proof that a token with the given ID has been minted only once.

**Token state** represents encoding of the current owner as a challenge requesting demonstration of knowledge of the private key for the given public key (via digital signature).

**Token state transition** consists of:
- A solution for the challenge encoded in the current state
- New state (ownership) the token transitions to

The token's current/latest state is demonstrated through a sequence of transitions from its genesis/minting to the latest state. Each transition includes a unicity proof generated by the Unicity infrastructure, proving this was the only transition from its source state. **Note:** It's impossible to generate two transitions of the same token state with unicity proofs.

#### Privacy Protection

To hide the token owner's public key from the Unicity public infrastructure (and everyone else reading data streams) as well as from previous token owners, the token state gets obfuscated with a precalculated random nonce. This creates a hash of:
- Recipient owner public key
- Nonce  
- Other data

This is shared with the sender as a **pointer** and with Unicity as the **commitment ID**. This design ensures:
- Neither the pointer nor the commitment can be used to derive each other
- The recipient's public key, nonce, token ID, and token class cannot be learned
- From the Unicity commitment alone, it's impossible to identify whether the commitment was generated for a token transition or anything else

As an additional privacy measure, we enforce one-time use of public keys by calculating key pairs based on the user's secret and one-time random nonce. This allows users to access and send tokens attached to seemingly different, unrelated public keys.

#### Token Structure

- **tokenId**: Unique 256-bit ID of the token
- **tokenClass**: Unique 256-bit code identifying the token class (e.g., unicity utility token, wrapped cryptocurrency, fiat token, NFT, or app-specific utility token). Developers can define their own token classes with specific minting and transfer rules (analogous to deploying custom ERC20 or ERC721 contracts)
- **tokenValue**: Numeric value represented as a big integer. Follow Ethereum-style fraction denomination (one monetary unit divisible into at most 10^18 atomic units)
- **Genesis**: All minting-related proofs and data
- **transitions**: Sequence of state transitions from genesis to latest state with all necessary Unicity and other proofs
- **state**: Current token state containing public key, nonce, etc.

### Transition vs Transaction

A **transition** is a record defining:
- What token state changes into what state
- Proofs unlocking the challenge encoded in the source state
- Unicity proof and salt

Since a token sender doesn't know the recipient's state (only the pointer), the sender cannot create a valid transition directly. Instead, the sender creates a **transaction** - a structure containing:
- Source token state
- Recipient's nonce
- Salt

The salt is a random value used to obfuscate the transaction digest so that anyone with knowledge of the source state (sender's public key) and recipient's pointer cannot guess from the Unicity commitment whether the token was transferred to the given recipient or elsewhere.

Only the recipient can resolve a transaction into the relevant transition by substituting the pointer with the respective recipient's token state.

#### Transaction Structure

- **Source state**: Sender's public key, nonce, tokenId, tokenClass, etc.
- **Input**: Sender's proof of ownership and Unicity (single-spend) proof
- **Destination pointer**: Pointer referring to the hidden expected token destination state (must be shared by recipient with sender)
- **Salt**: Randomly generated value to obfuscate and make the transaction digest unpredictable

#### Transition Structure

- **Source state**: Sender's public key, nonce, tokenId, tokenClass, etc.
- **Input**: Sender's proof of ownership and Unicity (single-spend) proof
- **Destination state**: Recipient's public key, nonce, tokenId, tokenClass, etc.
- **Salt**: Randomly generated value to obfuscate and make the transaction digest unpredictable

### State

Represents the current token state and encodes challenges that need to be solved to unlock the token. For instance, a challenge can be represented by the owner's public key as a request to demonstrate knowledge of the respective owner's private key.

#### State Structure

- **tokenId**: Unique 256-bit ID of the token
- **tokenClass**: Unique 256-bit code identifying the token class
- **pubkey**: The token owner's public key
- **nonce**: Randomly generated one-time use value (one time per public key-token pair)

### Unicity Commit

To prove no double-spend of a token, when creating a token transaction, the user must:

1. Submit the transaction commitment to the Unicity gateway
2. Obtain the unicity proof/certificate for the commitment
3. Include that proof in the transaction

The commitment is a key-value pair where:
- **Key**: Commit requestId derived from the current token's state such that each unique state derives a unique requestId, and it's impossible to derive the respective token state back from the requestId
- **Value**: Contains payload and authenticator field

Since all tokens throughout their lifecycle will never have the same state, their requestIds will be unique. If there's no double-spend intent, there will never be two different commits with the same requestId. Unicity cannot include and generate certificates for two different commits with the same requestId.

The **payload** is the digest of the transaction spending the given token state. Since a transaction contains a random salt, the payload cannot be predicted from the token source and destination pointer alone.

The **authenticator** is needed for the commit's self-authentication and contains:
- Owner's public key
- Payload signature  
- Obfuscated token state (so the requestId can be derived)

Only the token owner can register the transaction commit with Unicity since no one else knows the owner's private key and cannot produce the valid authenticator corresponding to the requestId.

### Transaction Flow

A structure containing token and optionally transaction data, used for sharing and synchronizing token state between users.

## Tools

### SDK: state_machine.js, helper.js

A library of functions for integrating your project with the transaction flow engine. Use it to mint, send, and receive tokens.

**Functions:**
- **mint**: Creates a token structure, generates Unicity certificate for proving single mint for the given token ID
- **createTx**: Generates transaction structure and single-spend proof in Unicity certificate for the token, recipient's pointer, salt, sender's secret, and transport object
- **exportFlow**: Exports token and transaction as a JSON object flow
- **importFlow**: Imports token and optionally transaction from the flow JSON object. If transaction is present, the recipient resolves it into the token state transition and derives the latest token state
- **getTokenStatus**: Probes the current token state against the given user's secret (verifies respective ownership) and spend proof (checks if the latest state has been spent but not updated in the given token structure) via querying the Unicity gateway
- **collectTokens**: Scans the set of given tokens and filters those unspent for the given user (derived from the user's secret)
- **helper.calculatePointer**: Derives pointer to be shared with the token sender. Derived from tokenClass, secret, and nonce

### CLI: token_manager.js

Command line tool for processing transaction flows and managing tokens. Uses `state_machine.js` and `helper.js`. Accepts input TX flow from stdin and outputs processed flow through stdout.

**Commands:**
- `./token_manager.js mint [options]`: Outputs TX flow with newly minted token
- `./token_manager.js pointer [options]`: Generates recipient's pointer. Must be run by recipient and the pointer shared with sender. **Note:** Keep the nonce secret and do not share it!
- `./token_manager.js send [options]`: Gets the token to be sent through TX flow in stdin and outputs TX flow with the transaction. **Note:** You must get the recipient's pointer first from the recipient
- `./token_manager.js receive [options]`: Consumes TX flow with token and transaction, resolves transaction into transition, updates token state, and outputs updated token as TX flow through stdout
- `./token_manager.js summary [options]`: From stdin TX flows, filters unspent tokens owned by the user defined by their secret and outputs summary (balance and owned tokens)

### CLI Convenience Tools

Scripts in `./cli` manage TX flows stored in `./txf` folder.

## Example Workflow

### Step 1: User1 Mints Token with secret1

```bash
stf/cli$ ./mint.sh 
Enter Token ID (default: random 6-digit number): 
Enter Token Class (default: unicity_test_coin): 
Enter Token Value (default: 10000000000000000000): 
Enter Nonce (default: random 6-digit number): 
Enter User Secret: secret1
```

**Output:**
```json
{
    "token": {
        "tokenId": "bd666f6719089472630dcf9a5920fefcd2da759372ad65045f0f512a0e10490f",
        "tokenClass": "27c709573730bff1d404e6345157d5e789f79f6172cf6ae8da79638d2718a426",
        "tokenValue": "1000000000000000000",
        "mintProofs": {
            "path": [
                {
                    "leaf": true,
                    "payload": "8ed257fdfe785fb631e2dfc85b9510c9b2b726a8050d2d1a579cb800a342f249",
                    "authenticator": {
                        "state": "0bfb45dcbf1183cfa7398ec15e042f1fc842114e306581e05fbea4f7f0c70348",
                        "pubkey": "04e75a8079c561babb297e3822046cb17385cca72535a3b01cf9bf3a4bed80dff4a26919463f6dba680a1e5e0d9b86aa832210152ca221911158eaf539ea538283",
                        "signature": "3045022100fab45c82a17d7aa0e5ba53ba08ed739bfce756a23e27afed10b2acad856f6fcf0220729affed31dda7f9862bb17c4934bab57684f3a76cbdb9e2044466801b14f078",
                        "sign_alg": "secp256k1",
                        "hash_alg": "sha256"
                    }
                }
            ]
        },
        "mintRequest": {
            "destPointer": "9ec0defaae8c4e52beba7499a91a9584a0cd8d467e1285cf8d90b83024b5618c"
        },
        "mintSalt": "49912c41447c29fbf1ecc147ed24df910ee995e005b448c80b8dcd9738a7f5bb",
        "genesis": {
            "challenge": {
                "tokenClass": "27c709573730bff1d404e6345157d5e789f79f6172cf6ae8da79638d2718a426",
                "tokenId": "bd666f6719089472630dcf9a5920fefcd2da759372ad65045f0f512a0e10490f",
                "sign_alg": "secp256k1",
                "hash_alg": "sha256",
                "pubkey": "043577a5e888b2d42ba1c4fe4bf8987a53e1936f9e2b978ef8e8e74b8c169252f059c18b16a26964c921e660823d540c6bc8c77418bd2606c365d8c4e92a21d2fd",
                "nonce": "79d883704b06f4b1d1cd72ab07e8fd830cbb11aec0ad923197b8406b7b9c7c23"
            }
        },
        "transitions": [],
        "state": {
            "challenge": {
                "tokenClass": "27c709573730bff1d404e6345157d5e789f79f6172cf6ae8da79638d2718a426",
                "tokenId": "bd666f6719089472630dcf9a5920fefcd2da759372ad65045f0f512a0e10490f",
                "sign_alg": "secp256k1",
                "hash_alg": "sha256",
                "pubkey": "043577a5e888b2d42ba1c4fe4bf8987a53e1936f9e2b978ef8e8e74b8c169252f059c18b16a26964c921e660823d540c6bc8c77418bd2606c365d8c4e92a21d2fd",
                "nonce": "79d883704b06f4b1d1cd72ab07e8fd830cbb11aec0ad923197b8406b7b9c7c23"
            }
        }
    },
    "transaction": null
}
```

```
================================================================================
Command executed successfully. TX flow saved to txf/unicity_test_coin_125223.txf.
```

### Step 2: User2 Generates Recipient Pointer

```bash
stf/cli$ ./pointer.sh 
Enter Token Class (default: unicity_test_coin): 
Enter Nonce (default: random 6-digit number): 
Enter User Secret: secret2
Nonce: 113524
Pointer: 7931e59604d2b6a3db52d8debf1aedd7074758761d8f87e36b50793151f7013f
```

**User2 shares pointer `7931e59604d2b6a3db52d8debf1aedd7074758761d8f87e36b50793151f7013f` with User1**

### Step 3: User1 Creates Transaction to Transfer Token to User2

```bash
stf/cli$ ./send.sh
Available transaction flow files:
1. txf/unicity_test_coin_112036.txf
2. txf/unicity_test_coin_118750.txf
3. txf/unicity_test_coin_121558.txf
4. txf/unicity_test_coin_122949.txf
5. txf/unicity_test_coin_125223.txf
6. txf/unicity_test_coin_125719.txf
7. txf/unicity_test_coin_127804.txf
Select a file by its number: 5
Enter Destination Pointer: 7931e59604d2b6a3db52d8debf1aedd7074758761d8f87e36b50793151f7013f
Enter User Secret: secret1
```

**Output includes the transaction structure...**

```
================================================================================
Token was spent successfully using transaction flow file txf/unicity_test_coin_125223.txf to destination 7931e59604d2b6a3db52d8debf1aedd7074758761d8f87e36b50793151f7013f.
File txf/unicity_test_coin_125223.txf was updated with the new transaction, but cannot be spent until the destination pointer is resolved into the full state.
Old transaction flow file is invalid now (unicity will not confirm spend from the old state anymore) and was archived into txf/unicity_test_coin_125223.txf.spent.1733269966
```

**User1 shares file `unicity_test_coin_125223.txf` with User2. User2 places this file into `txf/unicity_test_coin_125223.txf`**

### Step 4: User2 Receives the Token

User2 resolves the transaction in `unicity_test_coin_125223.txf` into the transition, transforming token ownership to User2. By knowing the recipient's nonce and secret, it's possible to regenerate the recipient state from the pointer:

```bash
stf/cli$ ./receive.sh 
Available transaction flow files:
1. txf/unicity_test_coin_112036.txf
2. txf/unicity_test_coin_118750.txf
3. txf/unicity_test_coin_121558.txf
4. txf/unicity_test_coin_122949.txf
5. txf/unicity_test_coin_125223.txf
6. txf/unicity_test_coin_125719.txf
7. txf/unicity_test_coin_127804.txf
Select a file by its number: 5
Enter Nonce: 113524
Enter User Secret: secret2
```

**Output includes the updated token with transition...**

```
======================================================================
Transaction received successfully for nonce 113524.
Updated file: txf/unicity_test_coin_125223.txf.
```

### Step 5: User2 Scans Available Tokens and Calculates Balance

```bash
stf/cli$ ./summarize.sh 
Transaction flow files:
1. txf/unicity_test_coin_112036.txf
2. txf/unicity_test_coin_118750.txf
3. txf/unicity_test_coin_121558.txf
4. txf/unicity_test_coin_122949.txf
5. txf/unicity_test_coin_125223.txf
6. txf/unicity_test_coin_125719.txf
7. txf/unicity_test_coin_127804.txf
Enter Token Class (default: unicity_test_coin): 
Enter User Secret: secret2
=============================
Tokens ready to be spent:
```

**Output shows available tokens and total balance...**

```bash
=============================
TXF files storing the tokens: 
8b49d4350bfd4f694e77fd7f683c794b12c47bd02f9b395bcd7c84a03e2d04db: txf/unicity_test_coin_125223.txf
01947e619d7dd070b6f77a7b8aa42af6e1a17e05235386fa54027aa1893d9ecf: txf/unicity_test_coin_127804.txf
```

---

This completes a full token transfer cycle from User1 to User2, demonstrating the off-chain token management with on-chain single-spend proofs provided by the Unicity infrastructure.

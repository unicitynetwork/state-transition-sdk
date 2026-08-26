# Unicity Token Transaction Protocol Specification

## 1. Introduction

The Unicity Token Transaction Protocol facilitates secure, verifiable off-chain token transfers while maintaining cryptographic guarantees of uniqueness and preventing double-spending. 
This specification details the implementation of a state transition abstract machine where tokens pass from one state to another through provably unique transitions, allowing for peer-to-peer token transfers without requiring continuous blockchain validation for every transaction.

## 2. Core Components and Concepts

### 2.1 Token

A token in the Unicity Protocol is a self-contained digital asset that exists off-chain as a standalone data structure. Unlike traditional blockchain tokens that are entries in a global ledger, a Unicity token is a complete package that contains its entire history, ownership information,
 and cryptographic proofs in one structure.

At its core, a token represents value, data or rights that can evolve and be transferred between parties. Each token is a cryptographically secured entity that can be verified independently without relying on continuous blockchain validation. This approach enables true peer-to-peer 
exchanges where the token itself carries all necessary information to verify its authenticity and ownership status.

The Unicity approach provides key advantages over traditional blockchain tokens:

1. **True Peer-to-Peer Exchange**: Tokens can be transferred directly between users without blockchain transactions for each transfer
2. **Privacy-Preserving**: Only minimal cryptographic commitments are published to the blockchain
3. **Highly Scalable**: Token transactions don't require individual blockchain entries
4. **Offline Capable**: Tokens can be transferred without continuous network connectivity
5. **Self-Verifying**: Each token contains its complete provenance and proof of legitimacy

A token's "physical" representation is a transaction flow structure that contains:

- **Token ID**: A unique identifier for the specific token instance
- **Token Class ID**: The class identifier that categorizes the token type (e.g., utility token, wrapped cryptocurrency, nft, an agent with advanced logic, etc.)
- **Token Value**: A numeric value associated with the token (represented as a BigInt and default 18 decimal digit precision like Eth)
- **Immutable Data**: Application-specific data that remains constant throughout the token's lifetime
- **Genesis State**: The initial state of the token, cryptographically verified during minting
- **Mint Proofs**: Cryptographic evidence demonstrating that the token was legitimately created once
- **Mint Request**: Information about the initial ownership assignment, including destination pointer
- **Mint Salt**: A random value used during the minting process to enhance security and privacy
- **Transitions**: An ordered sequence of verified state transitions forming a complete history

The token structure maintains its own ledger of state changes with cryptographic guarantees that the token has never been duplicated and that each state transition has been properly authorized by the legitimate owner at the time of the transition.

### 2.2 Transaction Flow

A transaction flow is the comprehensive structure that encapsulates a token's complete history and current transaction status. It serves as both the container for the token itself and the mechanism for transferring the token between parties (or generic states).

In the Unicity Protocol, the transaction flow is the fundamental unit of exchange. When tokens are transferred between users, the entire transaction flow (containing the token with its complete history and the pending transaction) is passed from sender to recipient. 
This comprehensive approach allows the recipient to:

1. Verify the complete token history from its genesis
2. Validate all past transitions for authenticity
3. Confirm the token hasn't been double-spent
4. Process the pending transaction to take ownership

The transaction flow structure consists of two primary components:
- **Token**: The complete token structure with all its history
- **Transaction**: The pending transfer operation (present when a token is being transferred)

When a transaction is completed (imported by the recipient), the transaction is converted into a transition and added to the token's history, and the transaction field is cleared. This means a token in a "resting state" has a null transaction field, while a token "in transit" 
contains both the token and a pending transaction.

This approach allows tokens to be transferred through any communication channel (email, messaging apps, file transfer) as a self-contained package with all necessary validation information, while maintaining cryptographic guarantees against double-spending through the Unicity infrastructure.

### 2.3 Transactions vs. Transitions

In the Unicity Protocol, it is crucial to understand the distinction between transactions and transitions:

#### Transaction:
- Created by the **sender** when initiating a token transfer
- SPENDS the current token state into a new state that is **unknown to the sender**
- Contains a destination reference (dest_ref) that points to the recipient's address (or more generic token unlocking condition), but does not contain the full destination state by itself
- The sender cannot know or determine the exact state the token will transition to
- Represents an "in-flight" token transfer that has not yet been completed (though, the token state has been already spent and cannot be spent again to some other dest_ref)
- Is a temporary structure that exists only during the transfer process

#### Transition:
- Created by the **recipient** after receiving a transaction
- Links the source state definitively to the destination state
- Contains both the full source and destination states
- Becomes a permanent part of the token's history
- Replaces the transaction in the token's record once the transfer is complete

The transaction-to-transition process works as follows:
1. Sender creates a transaction with dest_ref (but doesn't know the full destination state)
2. Recipient receives the transaction and has the private information (keys, nonce) to resolve dest_ref
3. Recipient constructs the full destination state, which is provably linked to the dest_ref
4. Recipient converts the transaction into a transition by adding the resolved destination state
5. The transition permanently replaces the transaction in the token's history

This approach provides unique privacy and security benefits:
- Senders can initiate transfers without knowing the recipient's full token state
- Recipients have cryptographic proof that only they can claim the token
- The protocol maintains a complete state transition history while preserving privacy (a sender will not be able to see when the token changes will change state again while monitoring Unicity and the recipient's network)

### 2.4 Token State

A token state represents a specific point in the token's lifecycle and contains:

- **Challenge**: An ownership verification mechanism (typically a public key challenge) that must be satisfied to spend the token
- **Auxiliary Data**: Optional information that facilitates the resolution of destination references to full states. For example, when using nametag addressing, the auxiliary data contains the nametag token that resolves the human-readable name to a public key. This data is crucial for maintaining the cryptographic link between destination references and the resulting states.
- **Data**: An application-specific data payload associated with this particular state (optional). This allows tokens to carry evolving application data as they transition from one state to another.

#### Request ID Generation

Each token state has a unique cryptographic identity in the Unicity system, represented by a Request ID. This Request ID is deterministically derived from the state using the following process:

1. A state hash is computed from the challenge and data components
2. The Request ID is then derived from a combination of the owner's public key and this state hash
3. The derivation process uses cryptographic hash functions that ensure:
   - The same state always produces the same Request ID
   - Different states will produce different Request IDs
   - It is computationally infeasible to find two different states that produce the same Request ID

This Request ID generation process is critical to the Unicity Protocol's security model because:
- It ensures each token state can be uniquely identified in the Unicity system
- It prevents double-spending by making it impossible to generate multiple valid transactions from the same state
- It allows the Unicity Aggregator to verify that a state is being spent only once without knowing the actual token details

When a token owner attempts to spend a token, the Unicity system uses this Request ID to verify the state hasn't been previously spent. Once a transaction with a particular Request ID is committed to the Unicity infrastructure, any subsequent attempts to spend the same state will be 
rejected because they would produce the same Request ID.

Each token state represents an "unspent output" similar to UTXO models in blockchain systems. A token can only be in one valid state at any given time, and transitioning to a new state cryptographically invalidates the previous state through the unicity mechanism.

### 2.5 Challenge Mechanism

The default challenge mechanism is a public key challenge with the following properties:

- **Token Class ID**: The class identifier for the token (ensures challenge is specific to token type)
- **Token ID**: The unique identifier for the specific token (prevents cross-token replay attacks)
- **Signature Algorithm**: Algorithm used for digital signatures (e.g., 'secp256k1')
- **Hash Algorithm**: Algorithm used for hashing (e.g., 'sha256')
- **Public Key**: The public key that locks the token state (ownership credential)
- **Nonce**: A one-time random value used to prevent ownership tracking and enhance privacy

The challenge mechanism serves as a cryptographic lock on the token state. To spend a token (transition it to a new state), the owner must prove knowledge of the private key corresponding to the public key in the current state's challenge. This is similar to how cryptocurrency wallets 
prove ownership of funds, but with additional privacy enhancements through nonce usage.

### 2.6 Unicity Proof

A Unicity Proof is a cryptographic artifact that provides irrefutable evidence that a specific token state has been transitioned exactly once. This proof is central to preventing double-spending in the Unicity Protocol without requiring all token transactions to be recorded on a blockchain.

#### Proof Components and Structure

A complete Unicity Proof consists of:

- **Path**: A sequence of authenticated records in a hierarchical data structure that leads from a globally verifiable root (often anchored in a blockchain) down to the specific transaction commitment. The path contains multiple cryptographic elements that, when verified together, establish
 that the commitment was uniquely registered.

- **Request ID**: The unique identifier derived from the token state being spent (as described in section 2.4). This ID serves as the commitment key in the Unicity system and is included in the proof to identify exactly which state is being spent.

- **Authenticator**: A cryptographic structure containing:
  - The token owner's public key
  - A digital signature created with the owner's private key
  - An obfuscated representation of the token state

- **Payload**: A cryptographic commitment to the transaction details, including destination reference and salt. This prevents correlation between the Unicity commitment and the actual token details.

#### Inclusion Proofs Mechanism

The inclusion proof works through a Merkle-like authenticated data structure with the following characteristics:

1. **Hierarchical Verification**: The proof demonstrates that a specific token state commitment is included in a larger authenticated data structure maintained by the Unicity Aggregator.

2. **Uniqueness Guarantee**: The Unicity Aggregator enforces that each Request ID can appear only once in the data structure, making it mathematically impossible to create two valid proofs for the same token state.

3. **Privacy Preservation**: The inclusion proof reveals only the Request ID to the Unicity system, not the actual token details, preserving the privacy of the transaction.

4. **Blockchain Anchoring**: The root of the authenticated data structure is periodically anchored to a blockchain, creating a tamper-proof reference point that allows verification without trusting the Unicity Aggregator.

5. **Independent Verifiability**: Any party with the token can cryptographically verify the inclusion proof without requiring trust in any central authority.

The combination of these elements creates a robust system where token states can be provably spent once and only once, without revealing token details to the broader network or requiring individual blockchain transactions for each token transfer.

### 2.7 Request Deadlines

A commitment submitted to the Unicity Aggregator carries a deadline: the point beyond which the sender no longer wants it committed. The aggregator groups commitments into rounds, and each round is pinned to a single reference time drawn from consensus. A commitment is admitted to a round only when that round's reference time is strictly below the deadline — the deadline is exclusive, so a round whose reference time has reached it is already too late.

Both the deadline and a round's reference time are **wall-clock instants in Unix seconds**, not round numbers or block heights. The reference time is the timestamp of the consensus seal that certified the preceding round, so it is the root chain's clock rather than any participant's. A sender that derives a deadline from its own clock is therefore comparing against a clock it does not control, and the two can differ by seconds; deadlines are meant to be set with enough margin to absorb that, and a sender with no trustworthy clock omits the deadline entirely (below).

The deadline exists because submission and commitment are separated in time. A commitment that sits in the queue while conditions change — a price moves, an offer lapses, a counterparty withdraws — should expire rather than execute late. Without a deadline, a sender has no way to bound how long a submitted commitment stays live.

A sender may supply the deadline explicitly, or leave it to the service:

- **Explicit.** The deadline is part of what the commitment's transaction hash commits to, so it is carried in the token and re-checked by every later verifier against the reference time the commitment was validated under. A verifier reaching a commitment whose recorded reference time is at or past its deadline rejects it.

- **Service-assigned.** A sender with no trustworthy clock omits the deadline, and the service derives one from consensus time plus its own configured request lifetime. That value is service metadata: it governs admission, but it is not recorded in the commitment, does not alter the transaction hash, and is not re-checked by a later verifier.

The reference time a commitment was validated under is a property of the commitment, not of any particular proof of it. The authenticated data structure is append-only, so a commitment can be proven against any later root, and a proof obtained later is anchored to a later round. The reference time recorded with the commitment does not move with it.

**What a deadline does and does not guarantee.** Admission is enforced by the aggregator at the moment it accepts the commitment. A later verifier can confirm that the recorded reference time is consistent with the commitment and precedes its deadline, but cannot establish when the commitment was actually created — the reference time is chosen by the aggregator, and the inclusion proof authenticates the value it chose rather than the moment it chose it. An aggregator that accepted a commitment after its deadline and recorded an earlier reference time would produce a proof that verifies. A deadline is therefore an instruction to an honest service, and the guarantee that a late commitment is dropped rather than executed rests on the same consensus that secures the aggregator, not on the deadline field alone.

## 3. State Transition Process

### 3.1 Transaction and Transition Structures

#### Transaction Structure

A transaction is the mechanism for spending a token state without knowing the destination state details:

- **Token ID**: Unique identifier for the token being transferred
- **Source**: The current token state (representing the sender's ownership)
- **Input**: Contains the unicity proof, unlocking mechanism, and destination information
- **Destination Reference (dest_ref)**: Privacy-preserving reference that specifies where to send the token
- **Salt**: Random value enhancing transaction privacy and preventing correlation

Unlike transactions in blockchain systems where all transaction data is publicly visible, Unicity transactions maintain privacy by only revealing a minimal commitment to the blockchain while keeping token details encrypted or off-chain.

The critical feature of a transaction is that it allows the sender to spend their token without knowing the full details of the destination state. This "half-complete" structure can only be completed by the legitimate recipient who has the necessary private information.

#### Transition Structure

A transition is the permanent record of a completed token state change:

- **Token ID**: Unique identifier for the token that changed state
- **Source**: The previous token state that was spent
- **Input**: Contains the unicity proof and unlocking mechanism used in the transaction
- **Destination**: The complete new token state (including challenge, data, etc.)

Transitions differ from transactions in that they contain the complete destination state information. Once a transition is completed and added to a token's history, it becomes an immutable part of that token's provenance and cannot be altered.

When a recipient imports a transaction, they convert it to a transition by:
1. Validating the transaction (verifying source, unicity proof, etc.)
2. Confirming the destination reference matches their expected pointer
3. Constructing the complete destination state using their private information
4. Replacing the transaction's destination reference with the full destination state

### 3.2 Transaction Input

The input component of a transaction serves as both the spending authorization and the destination specification:

- **Path**: The unicity proof path providing cryptographic evidence that this state has not been spent before
- **Destination Reference**: Address information for the recipient (in an obfuscated format)
- **Salt**: Random value used for privacy and to prevent correlation between transactions
- **Data Hash**: Hash of the destination state data (optional, enables data transfer with state transition)
- **Message**: Optional encrypted information for the recipient (only they can decrypt)

The transaction input is generated by the sender but can only be fully resolved into a complete state transition by the recipient who has the necessary private information to create the full destination state.

### 3.3 Destination Reference Types

Three methods are available for addressing token recipients, each with different privacy and usability characteristics:

- **Public Key Address**: Direct addressing using the recipient's public key
  - Simplest approach but provides less privacy
  - Sender specifies recipient's public key directly in dest_ref
  - Still uses salt signatures to prevent linking subsequent states

- **Pointer Address**: One-time use address derived from recipient's private key and a random nonce
  - Enhanced privacy that prevents linking different token states to the same owner
  - Recipient generates a keypair and blinding factor (nonce)
  - Pointer is calculated as hash(tokenClass || publicKey || nonce)
  - Requires recipient to share pointer with sender before transaction

- **Nametag Address**: Human-friendly addressing that resolves to a public key through a nametag token
  - Provides user-friendly addresses (similar to domain names vs. IP addresses)
  - Uses special tokens in the NAMETAG_TOKEN_CLASS
  - Nametag token ID is calculated as hash("NAMETAG_" + name)
  - Requires including the nametag token in auxiliary data

## 4. Token Transaction Flow

### 4.1 Token Creation (Minting)

1. Generate a token ID, class ID, value, genesis reason (validating token creation of the given type with the given initial parameters) and other token parameters
2. Create a mint salt and destination pointer for the initial owner
3. Generate cryptographic commitment to the token's initial state
4. Submit a state transition request to the Unicity Aggregator
5. Receive a unicity proof confirming this is the only mint for this token ID
6. Initialize the token with the genesis state and proof
7. The token now exists as a self-contained, cryptographically secured entity

The minting process creates a new token with an initial owner. Unlike traditional blockchain tokens that require on-chain creation transactions, Unicity tokens can be minted locally with only the unicity proof requiring interaction with the blockchain infrastructure.

### 4.2 Transaction Creation (Sending)

1. Sender verifies they own the token by checking the current state challenge against their private key
2. Sender obtains the destination reference from the intended recipient
3. Sender generates a random salt value to enhance privacy
4. Sender calculates a cryptographic commitment (payload) based on the current state, destination reference, and salt, optionally at the recipient's data hash and on message towards the recipient
5. Sender submits this commitment to the Unicity Aggregator to verify the state hasn't been spent
6. Sender receives a unicity proof if the state is spendable (not previously spent)
7. Sender creates a complete transaction structure containing:
   - The token being spent (with full history)
   - The spending transaction with unicity proof
   - The destination reference (but not the recipient's full state)
8. Sender delivers this transaction flow to the recipient through any secure channel

The transaction creation process produces a cryptographically secured structure that can only be completed by the intended recipient. The transaction flow can be transferred via any medium (email, messaging app, local drive) since its authenticity and integrity are protected by 
cryptographic means.

### 4.3 Transaction Import (Receiving)

1. Recipient receives the transaction flow containing the token and transaction
2. Recipient verifies the complete transaction flow:
   - Validates the token's entire history from genesis
   - Verifies all unicity proofs in the token's transitions
   - Ensures the transaction references the token's current state
   - Validates that the destination reference matches their expected pointer
3. Recipient uses their private information (private key and nonce, optionally data) to create the full destination state. Also, depending on the business case, recipient may validate the message in the transaction and match it against or use it to generate the data
4. Recipient resolves the transaction into a state transition by:
   - Applying their private information to derive the destination state
   - Creating a cryptographic link between the source and destination states
5. Recipient applies the transition to the token:
   - Records the transition in the token's history
   - Updates the token's current state to the new destination state
6. The token is now owned by the recipient and ready for further transactions

This import process completes the transaction. Unlike blockchain transactions where confirmation requires network consensus, Unicity transactions are confirmed immediately upon receipt, with only the unicity proofs requiring blockchain validation.

## 5. Verification Process

### 5.1 Token Verification

1. Verify the genesis state using mint proofs and genesis reason
2. Verify each transition in the token's history
3. Ensure the transitions form an unbroken chain from genesis to current state
4. Verify that the current state matches the final transition's destination

### 5.2 Unicity Certificate Verification

1. Calculate the Request ID from the owner's public key and state hash
2. Verify the inclusion proofs in the path
3. Verify that the authenticator's public key and state match the expected values
4. Confirm the Unicity Aggregator signature on the certificate is valid

### 5.3 Transition Verification

A transition is verified by:

1. Verifying the source state (unlock)
2. Validating the destination data matches the data hash
3. Verifying the destination reference resolves correctly
4. Checking that the destination pointer matches the expected pointer
5. Verifying the transaction payload matches the expected payload

## 6. Privacy Features

### 6.1 Pointer Addressing

When using pointer addressing (single-use address):

1. Recipient generates a keypair and a blinding factor (nonce)
2. Recipient calculates a pointer: hash(tokenClass || publicKey || nonce)
3. Sender uses this pointer as the destination reference
4. Recipient uses their private key and nonce to claim ownership
5. This prevents linking tokens to the same owner by observers

### 6.2 Salt Signatures

For public key addressing (multisue address):

1. Sender includes a random salt in the transaction
2. Recipient signs this salt with their private key
3. The signature is used to derive a nonce for the next state
4. This ensures that even with public key multiuse addressing, subsequent states remain unlinkable

## 7. Addressing Mechanisms

### 7.1 Public Key Addressing

Direct addressing using the recipient's public key:

1. Sender specifies the recipient's public key in the dest_ref
2. Recipient must prove knowledge of the corresponding private key
3. Provides simplicity but offers less privacy

### 7.2 Pointer Addressing

Privacy-preserving addressing:

1. Recipient generates a keypair and nonce
2. Pointer is calculated as hash(tokenClass || publicKey || nonce)
3. Sender uses the pointer as dest_ref
4. Recipient derives the new state challenge using their private key and nonce
5. Prevents observers from linking different token states to the same owner

### 7.3 Nametag Resolution

Human-friendly addressing:

1. Nametags are special tokens in the NAMETAG_TOKEN_CLASS
2. Nametag token ID is calculated as hash("NAMETAG_" + name)
3. Sender includes the nametag in the dest_ref
4. Recipient resolves the nametag to a public key stored in the nametag token
5. Recipient must include the nametag token in their auxiliary data

## 8. Security Properties

The protocol guarantees:

- **Authenticity**: Only the legitimate owner can spend a token
- **Uniqueness**: Each token state can transition to exactly one next state
- **Privacy**: Previous owners cannot track subsequent transactions
- **Verifiability**: Any party can verify the complete and unique history of a token

## 9. Implementation Requirements

### 9.1 Token Implementation

The token implementation must:

1. Maintain immutable fields (token ID, class, value, immutable data)
2. Store genesis state with mint proofs
3. Validate the genesis state using unicity proofs
4. Maintain a history of transitions
5. Verify each transition when importing
6. Update the current state after valid transitions
7. Prevent double-spending through unicity proofs

### 9.2 Transaction Creation

Transaction creation requires:

1. Access to the current token state
2. A valid destination reference
3. Communication with the Unicity Aggregator for proof generation
4. Proper signing capability using the owner's private key

### 9.3 Transaction Import

Transaction import requires:

1. Access to the token structure and transaction
2. Validation of the token's complete history
3. Validation of the unicity proof
4. Verification of the transition integrity
5. Creation of a valid destination state (using recipient's private information)
6. Conversion of the transaction into a state transition
7. Application of the transition to the token

## 10. Appendix: Code Interface

Key functions in the JavaScript implementation:

```javascript
// Create a new token (mint)
async function mint({token_id, token_class_id, token_value, immutable_data, token_data, secret, nonce, mint_salt, sign_alg, hash_alg, transport})

// Create a transaction
async function createTx(token, dest_ref, salt, secret, transport, dataHash, msg)

// Import a transaction
function importTx(token, tx, destination)

// Export token and transaction as a flow
function exportFlow(token, transaction, pretify)

// Import token and transaction from a flow
function importFlow(tokenTransitionFlow, secret, nonce, dataJson, nametagTokens)

// Generate a recipient pointer address
function generateRecipientPointerAddr()

// Generate a recipient public key address
function generateRecipientPubkeyAddr()
```

These interfaces provide the foundation for implementing the Unicity Token Transaction Protocol in client applications.

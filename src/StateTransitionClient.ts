import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from './address/DirectAddress.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { SubmitCommitmentStatus } from './api/SubmitCommitmentResponse.js';
import { ISerializable } from './ISerializable.js';
import { TokenCoinData } from './token/fungible/TokenCoinData.js';
import { NameTagToken } from './token/NameTagToken.js';
import { Token } from './token/Token.js';
import { TokenId } from './token/TokenId.js';
import { TokenState } from './token/TokenState.js';
import { TokenType } from './token/TokenType.js';
import { Commitment } from './transaction/Commitment.js';
import { MintTransactionData } from './transaction/MintTransactionData.js';
import { Transaction } from './transaction/Transaction.js';
import { TransactionData } from './transaction/TransactionData.js';

// TOKENID string SHA-256 hash
/**
 * Constant suffix used when deriving the mint initial state.
 */
export const MINT_SUFFIX = HexConverter.decode('9e82002c144d7c5796c50f6db50a0c7bbd7f717ae3af6c6c71a3e9eba3022730');
// I_AM_UNIVERSAL_MINTER_FOR_ string bytes
/**
 * Secret prefix for the signing used internally when minting tokens.
 */
export const MINTER_SECRET = HexConverter.decode('495f414d5f554e4956455253414c5f4d494e5445525f464f525f');

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionClient {
  /**
   * @param client Implementation used to talk to an aggregator
   */
  public constructor(private readonly client: IAggregatorClient) {}

  /**
   * Create and submit a mint transaction for a new token.
   *
   * @typeParam R Type of the optional reason object
   * @param recipient Address of the initial token owner
   * @param tokenId   Unique identifier for the token
   * @param tokenType Token type identifier
   * @param tokenData Serialized token payload
   * @param coinData  Fungible coin balance
   * @param salt      Unique salt used in the predicate
   * @param dataHash  Optional hash pointing to additional data
   * @param reason    Optional reason object attached to the mint
   * @returns Commitment containing the transaction data and authenticator
   * @throws Error when the aggregator rejects the transaction
   *
   * @example
   * ```ts
   * const commitment = await client.submitMintTransaction(
   *   recipientAddress,
   *   tokenId,
   *   tokenType,
   *   tokenData,
   *   coinData,
   *   salt,
   *   null,
   *   null
   * );
   * ```
   */
  public async submitMintTransaction<R extends ISerializable | null>(
    recipient: DirectAddress,
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: ISerializable,
    coinData: TokenCoinData,
    salt: Uint8Array,
    dataHash: DataHash | null,
    reason: R,
  ): Promise<Commitment<MintTransactionData<R>>> {
    const sourceState = await RequestId.createFromImprint(tokenId.encode(), MINT_SUFFIX);
    const signingService = await SigningService.createFromSecret(MINTER_SECRET, tokenId.encode());

    const requestId = await RequestId.create(signingService.publicKey, sourceState.hash);

    const transactionData = await MintTransactionData.create(
      tokenId,
      tokenType,
      tokenData,
      coinData,
      sourceState,
      recipient.toJSON(),
      salt,
      dataHash ?? null,
      reason,
    );

    const authenticator = await Authenticator.create(signingService, transactionData.hash, sourceState.hash);

    const result = await this.client.submitTransaction(requestId, transactionData.hash, authenticator);

    if (result.status !== SubmitCommitmentStatus.SUCCESS) {
      throw new Error(`Could not submit transaction: ${result.status}`);
    }

    return new Commitment(requestId, transactionData, authenticator);
  }

  /**
   * Submit a state transition for an existing token.
   *
   * @param transactionData Data describing the transition
   * @param signingService   Signing service for the current owner
   * @returns Commitment ready for inclusion proof retrieval
   * @throws Error if ownership verification fails or aggregator rejects
   *
   * @example
   * ```ts
   * const commitment = await client.submitTransaction(data, signingService);
   * ```
   */
  public async submitTransaction(
    transactionData: TransactionData,
    signingService: SigningService,
  ): Promise<Commitment<TransactionData>> {
    if (!(await transactionData.sourceState.unlockPredicate.isOwner(signingService.publicKey))) {
      throw new Error('Failed to unlock token');
    }

    const requestId = await RequestId.create(signingService.publicKey, transactionData.sourceState.hash);

    const authenticator = await Authenticator.create(
      signingService,
      transactionData.hash,
      transactionData.sourceState.hash,
    );
    const result = await this.client.submitTransaction(requestId, transactionData.hash, authenticator);

    if (result.status !== SubmitCommitmentStatus.SUCCESS) {
      throw new Error(`Could not submit transaction: ${result.status}`);
    }

    return new Commitment(requestId, transactionData, authenticator);
  }

  /**
   * Build a {@link Transaction} object once an inclusion proof is obtained.
   *
   * @param param0       Commitment returned from submit* methods
   * @param inclusionProof Proof of inclusion from the aggregator
   * @returns Constructed transaction object
   * @throws Error if the inclusion proof is invalid
   *
   * @example
   * ```ts
   * const tx = await client.createTransaction(commitment, inclusionProof);
   * ```
   */
  public async createTransaction<T extends TransactionData | MintTransactionData<ISerializable | null>>(
    { requestId, transactionData }: Commitment<T>,
    inclusionProof: InclusionProof,
  ): Promise<Transaction<T>> {
    const status = await inclusionProof.verify(requestId.toBigInt());
    if (status != InclusionProofVerificationStatus.OK) {
      throw new Error('Inclusion proof verification failed.');
    }

    if (!inclusionProof.authenticator || !HashAlgorithm[inclusionProof.authenticator.stateHash.algorithm]) {
      throw new Error('Invalid inclusion proof hash algorithm.');
    }

    if (!inclusionProof.transactionHash?.equals(transactionData.hash)) {
      throw new Error('Payload hash mismatch');
    }

    return new Transaction(transactionData, inclusionProof);
  }

  /**
   * Finalise a transaction and produce the next token state.
   *
   * @param token           Token being transitioned
   * @param state           New state after the transition
   * @param transaction     Transaction proving the state change
   * @param nametagTokens   Optional name tag tokens associated with the transfer
   * @returns Updated token instance
   * @throws Error if validation checks fail
   *
   * @example
   * ```ts
   * const updated = await client.finishTransaction(token, state, tx);
   * ```
   */
  public async finishTransaction<TD extends ISerializable, MDT extends MintTransactionData<ISerializable | null>>(
    token: Token<TD, MDT>,
    state: TokenState,
    transaction: Transaction<TransactionData>,
    nametagTokens: NameTagToken[] = [],
  ): Promise<Token<TD, MDT>> {
    if (!(await transaction.data.sourceState.unlockPredicate.verify(transaction))) {
      throw new Error('Predicate verification failed');
    }

    // TODO: Move address processing to a separate method
    // TODO: Resolve proxy address
    const expectedAddress = await DirectAddress.create(state.unlockPredicate.reference);
    if (expectedAddress.toJSON() !== transaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    const transactions: [Transaction<MDT>, ...Transaction<TransactionData>[]] = [...token.transactions, transaction];

    if (!(await transaction.containsData(state.data))) {
      throw new Error('State data is not part of transaction.');
    }

    return new Token(token.id, token.type, token.data, token.coins, state, transactions, nametagTokens);
  }

  /**
   * Query the ledger to see if the token's current state has been spent.
   *
   * @param token     Token to check
   * @param publicKey Public key of the owner
   * @returns Verification status reported by the aggregator
   *
   * @example
   * ```ts
   * const status = await client.getTokenStatus(token, ownerPublicKey);
   * ```
   */
  public async getTokenStatus(
    token: Token<ISerializable, MintTransactionData<ISerializable | null>>,
    publicKey: Uint8Array,
  ): Promise<InclusionProofVerificationStatus> {
    const requestId = await RequestId.create(publicKey, token.state.hash);
    const inclusionProof = await this.client.getInclusionProof(requestId);
    // TODO: Check ownership?
    return inclusionProof.verify(requestId.toBigInt());
  }

  /**
   * Convenience helper to retrieve the inclusion proof for a commitment.
   *
   * @example
   * ```ts
   * const proof = await client.getInclusionProof(commitment);
   * ```
   */
  public getInclusionProof(
    commitment: Commitment<TransactionData | MintTransactionData<ISerializable | null>>,
  ): Promise<InclusionProof> {
    return this.client.getInclusionProof(commitment.requestId);
  }
}

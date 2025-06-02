import { InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { IPredicate } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';
import { TransactionData } from '../transaction/TransactionData.js';

interface IPredicateJson {
  readonly type: PredicateType;
  readonly publicKey: string;
  readonly algorithm: string;
  readonly hashAlgorithm: HashAlgorithm;
  readonly nonce: string;
}

/**
 * Base predicate containing common verification logic for key-based predicates.
 */
export abstract class DefaultPredicate implements IPredicate {
  /**
   * @param type          Predicate type value
   * @param _publicKey    Public key able to sign transactions
   * @param algorithm     Signing algorithm name
   * @param hashAlgorithm Hash algorithm used for hashing operations
   * @param _nonce        Nonce providing uniqueness
   * @param reference     Reference hash of the predicate
   * @param hash          Hash of the predicate with a specific token
   */
  protected constructor(
    public readonly type: PredicateType.MASKED | PredicateType.UNMASKED,
    private readonly _publicKey: Uint8Array,
    public readonly algorithm: string,
    public readonly hashAlgorithm: HashAlgorithm,
    private readonly _nonce: Uint8Array,
    public readonly reference: DataHash,
    public readonly hash: DataHash,
  ) {
    this._publicKey = new Uint8Array(_publicKey);
    this._nonce = new Uint8Array(_nonce);
  }

  /** Public key associated with the predicate. */
  public get publicKey(): Uint8Array {
    return this._publicKey;
  }

  /** Nonce originally used to create the predicate. */
  public get nonce(): Uint8Array {
    return this._nonce;
  }

  /** Validate a JSON object representing a predicate. */
  public static isJSON(data: unknown): data is IPredicateJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'publicKey' in data &&
      typeof data.publicKey === 'string' &&
      'algorithm' in data &&
      typeof data.algorithm === 'string' &&
      'hashAlgorithm' in data &&
      !!HashAlgorithm[data.hashAlgorithm as keyof typeof HashAlgorithm] &&
      'nonce' in data &&
      typeof data.nonce === 'string'
    );
  }

  /** Serialise the predicate to JSON. */
  public toJSON(): IPredicateJson {
    return {
      algorithm: this.algorithm,
      hashAlgorithm: this.hashAlgorithm,
      nonce: HexConverter.encode(this.nonce),
      publicKey: HexConverter.encode(this.publicKey),
      type: this.type,
    };
  }

  /** Encode the predicate as a CBOR byte array. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(this.type),
      CborEncoder.encodeByteString(this.publicKey),
      CborEncoder.encodeTextString(this.algorithm),
      CborEncoder.encodeTextString(HashAlgorithm[this.hashAlgorithm]),
      CborEncoder.encodeByteString(this.nonce),
    ]);
  }

  /**
   * Verify a transaction against this predicate.
   */
  public async verify(
    transaction: Transaction<MintTransactionData<ISerializable> | TransactionData>,
  ): Promise<boolean> {
    if (!transaction.inclusionProof.authenticator || !transaction.inclusionProof.transactionHash) {
      return false;
    }

    // Verify if input state and public key are correct.
    if (
      HexConverter.encode(transaction.inclusionProof.authenticator.publicKey) !== HexConverter.encode(this.publicKey) ||
      !transaction.inclusionProof.authenticator.stateHash.equals(transaction.data.sourceState.hash)
    ) {
      return false; // input mismatch
    }

    // Verify if transaction data is valid.
    if (!(await transaction.inclusionProof.authenticator.verify(transaction.data.hash))) {
      return false;
    }

    // Verify inclusion proof path.
    const requestId = await RequestId.create(this.publicKey, transaction.data.sourceState.hash);
    const status = await transaction.inclusionProof.verify(requestId.toBigInt());
    return status === InclusionProofVerificationStatus.OK;
  }

  /** Human readable description of the predicate. */
  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            PublicKey: ${HexConverter.encode(this.publicKey)}
            Algorithm: ${this.algorithm}
            Hash Algorithm: ${HashAlgorithm[this.hashAlgorithm]}
            Nonce: ${HexConverter.encode(this.nonce)}
            Hash: ${this.hash.toString()}`;
  }

  /** Check if the supplied public key matches the predicate owner. */
  public isOwner(publicKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(HexConverter.encode(publicKey) === HexConverter.encode(this.publicKey));
  }
}

import { InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
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

interface IPredicateDto {
  readonly type: PredicateType;
  readonly publicKey: string;
  readonly algorithm: string;
  readonly hashAlgorithm: HashAlgorithm;
  readonly nonce: string;
}

export abstract class DefaultPredicate implements IPredicate {
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

  public get publicKey(): Uint8Array {
    return this._publicKey;
  }

  public get nonce(): Uint8Array {
    return this._nonce;
  }

  public static isDto(data: unknown): data is IPredicateDto {
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

  public toDto(): IPredicateDto {
    return {
      algorithm: this.algorithm,
      hashAlgorithm: this.hashAlgorithm,
      nonce: HexConverter.encode(this.nonce),
      publicKey: HexConverter.encode(this.publicKey),
      type: this.type,
    };
  }

  public async verify(
    transaction: Transaction<MintTransactionData<ISerializable> | TransactionData>,
  ): Promise<boolean> {
    // Verify if input state and public key are correct.
    if (!transaction.inclusionProof.authenticator) {
      return false; // no authenticator
    }
    
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

  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            PublicKey: ${HexConverter.encode(this.publicKey)}
            Algorithm: ${this.algorithm}
            Hash Algorithm: ${HashAlgorithm[this.hashAlgorithm]}
            Nonce: ${HexConverter.encode(this.nonce)}
            Hash: ${this.hash.toString()}`;
  }

  public isOwner(publicKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(HexConverter.encode(publicKey) === HexConverter.encode(this.publicKey));
  }
}

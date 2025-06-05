import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';
import { TransactionData } from '../transaction/TransactionData.js';
import { PredicateType } from './PredicateType.js';

/**
 * JSON representation of a predicate.
 */
export interface IPredicateJson {
  readonly type: string;
}

/**
 * Interface for a predicate that controls token ownership.
 */
export interface IPredicate {
  readonly type: PredicateType;
  /** Reference hash used in addresses. */
  readonly reference: DataHash;
  /** Unique hash identifying the predicate. */
  readonly hash: DataHash;
  /** Nonce used when creating the predicate. */
  readonly nonce: Uint8Array;

  /**
   * Test if the given key is allowed to operate the token.
   * @param publicKey Public key to check ownership
   */
  isOwner(publicKey: Uint8Array): Promise<boolean>;
  /**
   * Verify a transaction against the predicate.
   * @param transaction Transaction to verify
   */
  verify(transaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData>): Promise<boolean>;
  /**
   * Convert the predicate to its JSON representation.
   */
  toJSON(): IPredicateJson;
  /**
   * Convert the predicate to its CBOR representation.
   */
  toCBOR(): Uint8Array;
}

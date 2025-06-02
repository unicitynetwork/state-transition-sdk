import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';
import { TransactionData } from '../transaction/TransactionData.js';

/**
 * JSON representation of a predicate.
 */
export interface IPredicateJson {
  readonly type: string;
}

/**
 * Runtime representation of a token ownership predicate.
 */
export interface IPredicate {
  /** Unique reference used in addresses. */
  readonly reference: DataHash;
  /** Full hash identifying the predicate. */
  readonly hash: DataHash;
  /** Nonce used when creating the predicate. */
  readonly nonce: Uint8Array;

  /** Test if the given key is allowed to operate the token. */
  isOwner(publicKey: Uint8Array): Promise<boolean>;
  /** Verify a transaction's inclusion and signature. */
  verify(transaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData>): Promise<boolean>;
  /** JSON serialisation. */
  toJSON(): IPredicateJson;
  /** CBOR serialisation. */
  toCBOR(): Uint8Array;
}

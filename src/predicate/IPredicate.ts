import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';
import { TransactionData } from '../transaction/TransactionData.js';

export interface IPredicateJson {
  readonly type: string;
}

export interface IPredicate {
  readonly reference: DataHash;
  readonly hash: DataHash;
  readonly nonce: Uint8Array;

  isOwner(publicKey: Uint8Array): Promise<boolean>;
  verify(transaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData>): Promise<boolean>;
  toJSON(): IPredicateJson;
  toCBOR(): Uint8Array;
}

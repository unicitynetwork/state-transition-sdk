import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';

import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from './MintTransactionData.js';
import { TransactionData } from './TransactionData.js';

/**
 * Result returned when submitting a transaction to the aggregator.
 */
export class Commitment<T extends TransactionData | MintTransactionData<ISerializable | null>> {
  /**
   * @param requestId       Request identifier used for submission
   * @param transactionData Submitted transaction data
   * @param authenticator   Signature over the payload
   */
  public constructor(
    public readonly requestId: RequestId,
    public readonly transactionData: T,
    public readonly authenticator: Authenticator,
  ) {}
}

import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { SubmitCommitmentResponse } from './SubmitCommitmentResponse.js';

/**
 * Client interface for interacting with an aggregator service.
 */
export interface IAggregatorClient {
  /**
   * Submit a transaction commitment for inclusion in the ledger.
   *
   * @param requestId       Unique request identifier
   * @param transactionHash Hash of the transaction payload
   * @param authenticator   Authenticator proving request ownership
   * @returns Result status from the aggregator
   */
  submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse>;

  /**
   * Retrieve an inclusion proof for the given request.
   *
   * @param requestId Request identifier to query
   * @returns The inclusion proof returned by the aggregator
   */
  getInclusionProof(requestId: RequestId): Promise<InclusionProof>;
}

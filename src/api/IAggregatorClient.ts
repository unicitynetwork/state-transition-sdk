import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { SubmitCommitmentResponse } from './SubmitCommitmentResponse.js';

/**
 * Abstraction for JSON-RPC communication with an aggregator.
 */
export interface IAggregatorClient {
  /**
   * Submit a transaction commitment.
   */
  submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse>;

  /**
   * Obtain the inclusion proof for the given request.
   */
  getInclusionProof(requestId: RequestId): Promise<InclusionProof>;
}

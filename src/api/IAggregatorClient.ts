import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { IAuthenticator } from './IAuthenticator.js';
import { SubmitCommitmentResponse } from './SubmitCommitmentResponse.js';

export interface IAggregatorClient {
  submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: IAuthenticator,
  ): Promise<SubmitCommitmentResponse>;

  getInclusionProof(requestId: RequestId, blockNum?: bigint): Promise<InclusionProof>;
  
  getNoDeletionProof(requestId: RequestId): Promise<unknown>;
}

import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { JsonRpcHttpTransport } from '@unicitylabs/commons/lib/json-rpc/JsonRpcHttpTransport.js';

import { IAggregatorClient } from './IAggregatorClient.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from './SubmitCommitmentResponse.js';
import { SubmitCommitmentRequest } from './SubmitCommitmentRequest.js';

export class AggregatorClient implements IAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;
  public constructor(url: string) {
    this.transport = new JsonRpcHttpTransport(url);
  }

  public async submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
    receipt: boolean = false,
  ): Promise<SubmitCommitmentResponse> {
    const request = new SubmitCommitmentRequest(requestId, transactionHash, authenticator, receipt);

    const response = await this.transport.request('submit_commitment', request.toJSON());

    return SubmitCommitmentResponse.fromJSON(response)
  }

  public async getInclusionProof(requestId: RequestId, blockNum?: bigint): Promise<InclusionProof> {
    const data = { blockNum: blockNum?.toString(), requestId: requestId.toJSON() };
    return InclusionProof.fromJSON(await this.transport.request('get_inclusion_proof', data));
  }

  public getNoDeletionProof(requestId: RequestId): Promise<unknown> {
    const data = { requestId: requestId.toJSON() };
    return this.transport.request('get_no_deletion_proof', data);
  }
}

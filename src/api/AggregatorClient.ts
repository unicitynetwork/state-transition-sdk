import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { JsonRpcHttpTransport } from '@unicitylabs/commons/lib/json-rpc/JsonRpcHttpTransport.js';

import { IAggregatorClient } from './IAggregatorClient.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from './SubmitCommitmentResponse.js';

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient implements IAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   */
  public constructor(url: string) {
    this.transport = new JsonRpcHttpTransport(url);
  }

  /**
   * @inheritDoc
   */
  public async submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse> {
    const data = {
      authenticator: authenticator.toJSON(),
      requestId: requestId.toJSON(),
      transactionHash: transactionHash.toJSON(),
    };

    await this.transport.request('submit_commitment', data);
    // TODO: Fix response
    return new SubmitCommitmentResponse(SubmitCommitmentStatus.SUCCESS);
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(requestId: RequestId, blockNum?: bigint): Promise<InclusionProof> {
    const data = { blockNum: blockNum?.toString(), requestId: requestId.toJSON() };
    return InclusionProof.fromJSON(await this.transport.request('get_inclusion_proof', data));
  }

  /**
   * Fetch a proof that the given request has not been deleted from the ledger.
   *
   * @param requestId Request identifier
   */
  public getNoDeletionProof(requestId: RequestId): Promise<unknown> {
    const data = { requestId: requestId.toJSON() };
    return this.transport.request('get_no_deletion_proof', data);
  }
}

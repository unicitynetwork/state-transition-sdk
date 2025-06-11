import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { LeafValue } from '@unicitylabs/commons/lib/api/LeafValue.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import {
  SubmitCommitmentResponse,
  SubmitCommitmentStatus,
} from '@unicitylabs/commons/lib/api/SubmitCommitmentResponse.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';

class Transaction {
  public constructor(
    public readonly authenticator: Authenticator,
    public readonly transactionHash: DataHash,
  ) {}
}

export class TestAggregatorClient implements IAggregatorClient {
  private readonly requests: Map<bigint, Transaction> = new Map();

  public constructor(private readonly smt: SparseMerkleTree) {}

  public async submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse> {
    const path = requestId.toBigInt();
    const transaction = new Transaction(authenticator, transactionHash);
    const leafValue = await LeafValue.create(authenticator, transactionHash);
    this.smt.addLeaf(path, leafValue.bytes);
    this.requests.set(path, transaction);

    return new SubmitCommitmentResponse(SubmitCommitmentStatus.SUCCESS);
  }

  public async getInclusionProof(requestId: RequestId): Promise<InclusionProof> {
    const transaction = this.requests.get(requestId.toBigInt());
    // TODO: If element does not exist, authenticator and transactionHash should be null
    return Promise.resolve(
      new InclusionProof(
        await this.smt.getPath(requestId.toBigInt()),
        transaction?.authenticator ?? null,
        transaction?.transactionHash ?? null,
      ),
    );
  }
}

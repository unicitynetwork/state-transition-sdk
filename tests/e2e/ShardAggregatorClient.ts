import { ShardId } from '../../src/api/bft/ShardId.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationRequest } from '../../src/api/CertificationRequest.js';
import { CertificationResponse } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { IRequestOptions } from '../../src/api/IRequestOptions.js';
import { JsonRpcHttpTransport } from '../../src/api/json-rpc/JsonRpcHttpTransport.js';
import { StateId } from '../../src/api/StateId.js';
import { HexConverter } from '../../src/util/HexConverter.js';

/**
 * Client implementation that routes requests to the correct shard aggregator based on state ID.
 */
export class ShardAggregatorClient implements IAggregatorClient {
  private readonly shards: [ShardId, JsonRpcHttpTransport][];

  public constructor(
    shards: [ShardId, string][],
    private readonly key: string | null = null,
  ) {
    this.shards = shards
      .sort(([a], [b]) => b.length - a.length)
      .map(([shardId, url]) => [shardId, new JsonRpcHttpTransport(url)]);
  }

  public async getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    const transport = this.getTransport(stateId);
    const data = { stateId: HexConverter.encode(stateId.data) };
    return InclusionProofResponse.fromCBOR(
      HexConverter.decode((await transport.request('get_inclusion_proof.v2', data, new Headers(), options)) as string),
    );
  }

  public async getLatestBlockNumber(): Promise<bigint> {
    const heights = await Promise.all(
      this.shards.map(async ([, transport]) => {
        const response = await transport.request('get_block_height', {});
        if (
          response &&
          typeof response === 'object' &&
          'blockNumber' in response &&
          (typeof response.blockNumber === 'string' ||
            typeof response.blockNumber === 'number' ||
            typeof response.blockNumber === 'bigint')
        ) {
          return BigInt(response.blockNumber);
        }
        throw new Error('Invalid response format for block height');
      }),
    );
    return heights.reduce((max, h) => (h > max ? h : max));
  }

  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const request = await CertificationRequest.create(certificationData);
    const transport = this.getTransport(request.stateId);

    const response = await transport.request(
      'certification_request',
      HexConverter.encode(request.toCBOR()),
      this.key ? new Headers([['X-API-Key', this.key]]) : undefined,
    );

    return CertificationResponse.fromJSON(response);
  }

  private getTransport(stateId: StateId): JsonRpcHttpTransport {
    for (const [shardId, transport] of this.shards) {
      if (shardId.length === 0 || shardId.isPrefixOf(stateId.data)) {
        return transport;
      }
    }
    throw new Error(`No aggregator configured for state ID: ${HexConverter.encode(stateId.data)}`);
  }
}

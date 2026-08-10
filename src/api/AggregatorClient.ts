import { CertificationData } from './CertificationData.js';
import { CertificationRequest } from './CertificationRequest.js';
import { CertificationResponse } from './CertificationResponse.js';
import { IAggregatorClient } from './IAggregatorClient.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { IRequestOptions } from './IRequestOptions.js';
import { JsonRpcHttpTransport } from './json-rpc/JsonRpcHttpTransport.js';
import { StateId } from './StateId.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient implements IAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;
  readonly #key: string | null;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   * @param key API key for authenticating
   * @param allowInsecureTransport When `true`, permit sending the API key over a non-HTTPS URL
   *   (intended for local development and testing only).
   * @throws {Error} If an API key is supplied for a non-HTTPS URL and `allowInsecureTransport` is `false`.
   */
  public constructor(url: string, key: string | null = null, allowInsecureTransport: boolean = false) {
    if (key != null && !allowInsecureTransport && new URL(url).protocol !== 'https:') {
      throw new Error('API key must not be sent over plaintext HTTP; use an https URL.');
    }

    this.#key = key;
    this.transport = new JsonRpcHttpTransport(url);
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    const data = { stateId: HexConverter.encode(stateId.data) };
    return InclusionProofResponse.fromCBOR(
      HexConverter.decode(
        (await this.transport.request('get_inclusion_proof.v2', data, new Headers(), options)) as string,
      ),
    );
  }

  /**
   * Query the aggregator's latest block number.
   *
   * @returns {Promise<bigint>} Latest block number.
   * @throws {Error} If the response does not contain a numeric `blockNumber`.
   */
  public async getLatestBlockNumber(): Promise<bigint> {
    const response = await this.transport.request('get_block_height', {});
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
  }

  /**
   * @inheritDoc
   */
  public async submitCertificationRequest(
    certificationData: CertificationData,
    options?: IRequestOptions,
  ): Promise<CertificationResponse> {
    const request = await CertificationRequest.create(certificationData);

    const headers = new Headers([['X-State-ID', HexConverter.encode(request.stateId.data)]]);
    if (this.#key) {
      headers.set('X-API-Key', this.#key);
    }

    const response = await this.transport.request(
      'certification_request',
      HexConverter.encode(request.toCBOR()),
      headers,
      options,
    );

    return CertificationResponse.fromJSON(response);
  }
}

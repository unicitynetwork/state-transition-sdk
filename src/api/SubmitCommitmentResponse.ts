import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { Signature } from '@unicitylabs/commons/lib/signing/Signature.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';

/**
 * Possible results from the aggregator when submitting a commitment.
 */
export enum SubmitCommitmentStatus {
  /** The commitment was accepted and stored. */
  SUCCESS = 'SUCCESS',
  /** Signature verification failed. */
  AUTHENTICATOR_VERIFICATION_FAILED = 'AUTHENTICATOR_VERIFICATION_FAILED',
  /** Request identifier did not match the payload. */
  REQUEST_ID_MISMATCH = 'REQUEST_ID_MISMATCH',
  /** A commitment with the same request id already exists. */
  REQUEST_ID_EXISTS = 'REQUEST_ID_EXISTS',
}

/**
 * Request object sent by the client to the aggregator.
 */
class Request {
  public readonly service: string;
  public readonly method: string;
  public readonly requestId: RequestId;
  public readonly stateHash: DataHash;
  public readonly transactionHash: DataHash;
  public readonly hash: DataHash;

  private constructor(service: string, method: string, requestId: RequestId, stateHash: DataHash, transactionHash: DataHash, hash: DataHash) {
    this.service = service;
    this.method = method; 
    this.requestId = requestId;
    this.stateHash = stateHash;
    this.transactionHash = transactionHash;
    this.hash = hash;
  }

  public static async create(service: string, method: string, requestId: RequestId, stateHash: DataHash, transactionHash: DataHash): Promise<Request> {
    const cborBytes = CborEncoder.encodeArray([
      CborEncoder.encodeTextString(service),
      CborEncoder.encodeTextString(method),
      requestId.toCBOR(),
      stateHash.toCBOR(),
      transactionHash.toCBOR(),
    ]);
    
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(cborBytes).digest();
    return new Request(service, method, requestId, stateHash, transactionHash, hash);
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(this.service),
      CborEncoder.encodeTextString(this.method),
      this.requestId.toCBOR(),
      this.stateHash.toCBOR(),
      this.transactionHash.toCBOR(),
    ]);
  }

  public toJSON(): IRequestJson {
    return {
      service: this.service,
      method: this.method,
      requestId: this.requestId.toJSON(),
      stateHash: this.stateHash.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
    };
  }

  public toString(): string {
    return dedent`
      Request
        Service: ${this.service}
        Method: ${this.method}
        Request ID: ${this.requestId.toString()}
        State Hash: ${this.stateHash.toString()}
        Transaction Hash: ${this.transactionHash.toString()}
      `;
  }
}

export interface IRequestJson {
  service: string;
  method: string;
  requestId: string;
  stateHash: string;
  transactionHash: string;
}

export interface ISubmitCommitmentResponseJson {
  readonly status: SubmitCommitmentStatus;
  request?: IRequestJson;
  algorithm?: string;
  publicKey?: string;
  signature?: string;
}

/**
 * Response object returned by the aggregator on commitment submission.
 */
export class SubmitCommitmentResponse {
  public constructor(
    public readonly status: SubmitCommitmentStatus,
    public readonly request?: Request,
    public readonly algorithm?: string,
    public readonly publicKey?: string,
    public readonly signature?: Signature,
  ) {}

  /**
   * Parse a JSON response object.
   *
   * @param data Raw response
   * @returns Parsed response
   * @throws Error if the data does not match the expected shape
   */
  public static async fromJSON(data: unknown): Promise<SubmitCommitmentResponse> {
    if (!SubmitCommitmentResponse.isJSON(data)) {
      throw new Error('Parsing submit state transition response failed.');
    }

    const request = data.request ? await Request.create(
        data.request.service,
        data.request.method,
        RequestId.fromJSON(data.request.requestId),
        DataHash.fromJSON(data.request.stateHash),
        DataHash.fromJSON(data.request.transactionHash),
      )
    : undefined;

    return new SubmitCommitmentResponse(data.status, request, data.algorithm, data.publicKey, data.signature ? Signature.fromJSON(data.signature) : undefined);
  }

  /**
   * Convert the response to a JSON object.
   *
   * @returns JSON representation of the response
   */
  public toJSON(): ISubmitCommitmentResponseJson {
    const response: ISubmitCommitmentResponseJson = { status: this.status };
    if (this.request) {
      response.request = this.request.toJSON();
    }
    if (this.algorithm) {
      response.algorithm = this.algorithm;
    }
    if (this.publicKey) {
      response.publicKey = this.publicKey;
    }
    if (this.signature) {
      response.signature = this.signature.toJSON();
    }
    return response;
  }

  /**
   * Check if the given data is a valid JSON response object.
   *
   * @param data Raw response
   * @returns True if the data is a valid JSON response object
   */
  public static isJSON(data: unknown): data is ISubmitCommitmentResponseJson {
    return typeof data === 'object' && data !== null && 'status' in data && typeof data.status === 'string';
  }

  /**
   * Verify the receipt of the commitment.
   *
   * @returns True if the receipt is valid, false otherwise
   */
  public async verifyReceipt(): Promise<boolean> {
    if (!this.signature || !this.publicKey || !this.request) {
      return false;
    }

    return SigningService.verifyWithPublicKey(this.request.hash.imprint, this.signature.bytes, HexConverter.decode(this.publicKey));
  }
}

import { InvalidJsonStructureError } from '../serialization/json/InvalidJsonStructureError.js';

/**
 * Possible results from the aggregator when submitting a certification request.
 */
export enum CertificationStatus {
  /** The certification request was accepted and stored. */
  SUCCESS = 'SUCCESS',
  /** State identifier did not match the payload. */
  STATE_ID_MISMATCH = 'STATE_ID_MISMATCH',
  /** Signature verification failed. */
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  /** The signature format is invalid. */
  INVALID_SIGNATURE_FORMAT = 'INVALID_SIGNATURE_FORMAT',
  /** The public key format is invalid. */
  INVALID_PUBLIC_KEY_FORMAT = 'INVALID_PUBLIC_KEY_FORMAT',
  /** The source state hash format is invalid. */
  INVALID_SOURCE_STATE_HASH_FORMAT = 'INVALID_SOURCE_STATE_HASH_FORMAT',
  /** The transaction hash format is invalid. */
  INVALID_TRANSACTION_HASH_FORMAT = 'INVALID_TRANSACTION_HASH_FORMAT',
  /** The specified algorithm is not supported. */
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  /** The certification request was submitted to an invalid shard. */
  INVALID_SHARD = 'INVALID_SHARD',
  /** The round's reference time had already reached the request's timeout. */
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
}

/**
 * JSON shape of a certification response.
 */
export interface ICertificationResponseJson {
  readonly status: string;
}

/**
 * Response object returned by the aggregator on certification request.
 *
 * The status is deliberately tolerant: the aggregator may emit status strings unknown to this SDK
 * version (older deployments, or statuses added later). An unknown status parses successfully and
 * must be treated by callers as "the request was not accepted" — the caller then probes
 * `getInclusionProof` to learn the state's actual certification, instead of failing on parse.
 */
export class CertificationResponse {
  /** The aggregator's status string. Known values are enumerated in {@link CertificationStatus};
   * compare against those members. Unknown strings are preserved as-is. */
  public constructor(public readonly status: string) {}

  /**
   * Create a new certification response.
   * @param {string} status Certification response status (unknown strings allowed — see class doc)
   *
   * @returns {CertificationResponse} Created certification response
   */
  public static create(status: string): CertificationResponse {
    return new CertificationResponse(status);
  }

  /**
   * Parse a JSON response object.
   *
   * @param {unknown} data Raw response
   * @returns {Promise<>CertificationResponse>} Parsed response
   * @throws {InvalidJsonStructureError} Error if the data does not match the expected shape
   */
  public static fromJSON(data: unknown): CertificationResponse {
    if (!CertificationResponse.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new CertificationResponse(data.status);
  }

  /**
   * Check if the given data is a valid JSON response object.
   *
   * @param {unknown} data Raw response
   * @returns {boolean} True if the data is a valid JSON response object
   */
  public static isJSON(data: unknown): data is ICertificationResponseJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'status' in data &&
      typeof data.status === 'string' &&
      data.status.length > 0
    );
  }

  /**
   * Convert the response to a JSON object.
   *
   * @returns {ICertificationResponseJson} JSON representation of the response
   */
  public toJSON(): ICertificationResponseJson {
    return {
      status: this.status,
    };
  }
}

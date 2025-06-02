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

interface ISubmitCommitmentResponseDto {
  readonly status: SubmitCommitmentStatus;
}

/**
 * Response object returned by the aggregator on submission.
 */
export class SubmitCommitmentResponse {
  /**
   * Create a new response instance.
   *
   * @param status Status value returned from the aggregator
   */
  public constructor(public readonly status: SubmitCommitmentStatus) {}

  /**
   * Parse a JSON response object.
   *
   * @param data Raw response DTO
   * @returns Parsed response
   * @throws Error if the data does not match the expected shape
   */
  public static fromDto(data: unknown): SubmitCommitmentResponse {
    if (!SubmitCommitmentResponse.isDto(data)) {
      throw new Error('Parsing submit state transition response failed.');
    }

    return new SubmitCommitmentResponse(data.status);
  }

  /**
   * Check if a value conforms to the response DTO type.
   */
  public static isDto(data: unknown): data is ISubmitCommitmentResponseDto {
    return typeof data === 'object' && data !== null && 'status' in data && typeof data.status === 'string';
  }
}

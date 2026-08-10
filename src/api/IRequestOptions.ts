/**
 * Per-request options accepted by aggregator client methods.
 */
export interface IRequestOptions {
  /**
   * Signal that cancels the request. Implementations performing network I/O
   * should forward it to the underlying transport so that an abandoned request
   * is released instead of running to completion.
   */
  readonly signal?: AbortSignal;
}

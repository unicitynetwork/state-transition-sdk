/**
 * Optional inputs to {@link TransferTransaction.create}.
 *
 * Every field is optional and order-independent, so a caller supplies only what
 * it cares about and later additions do not disturb existing call sites.
 */
export interface ITransferOptions {
  /** Optional data payload. */
  readonly data?: Uint8Array | null;
  /**
   * Exclusive request deadline in Unix seconds. Omit it, or pass `null`, to let
   * the Unicity Service assign a deadline from consensus time; that requires no
   * local clock, and the assigned value is not recorded in the token.
   */
  readonly expiresAt?: bigint | null;
}

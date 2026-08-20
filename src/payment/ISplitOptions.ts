import { StateMask } from '../transaction/StateMask.js';

/**
 * Optional inputs to {@link TokenSplit.split}.
 */
export interface ISplitOptions {
  /**
   * State mask for the burn transaction. Defaults to a random value; callers
   * needing a crash-resumable (re-buildable) split supply a deterministically
   * derived mask so the identical burn transaction can be reconstructed after a
   * failure.
   */
  readonly burnStateMask?: StateMask;
  /**
   * Exclusive request deadline in Unix seconds for the burn transaction. Omit
   * it, or pass `null`, to let the Unicity Service assign one.
   */
  readonly expiresAt?: bigint | null;
}

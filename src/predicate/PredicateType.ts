/**
 * Enumeration of predicate implementations supported by the SDK.
 */
export enum PredicateType {
  /** Predicate with hidden nonce */
  MASKED = 'MASKED',
  /** Predicate exposing nonce */
  UNMASKED = 'UNMASKED',
  /** Special predicate burning the token */
  BURN = 'BURN',
}

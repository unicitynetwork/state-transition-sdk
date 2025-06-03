/**
 * Enum representing different types of predicates.
 */
export enum PredicateType {
  /** Predicate for masked address */
  MASKED = 'MASKED',
  /** Predicate for public address */
  UNMASKED = 'UNMASKED',
  /** Special predicate burning the token */
  BURN = 'BURN',
}

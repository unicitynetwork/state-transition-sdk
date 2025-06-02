import { AddressScheme } from './AddressScheme.js';

/**
 * Common interface implemented by all address types.
 */
export interface IAddress {
  /** Scheme describing how the address should be resolved. */
  readonly scheme: AddressScheme;

  /**
   * Serialise the address into a URI-like string representation.
   */
  toJSON(): string;
}

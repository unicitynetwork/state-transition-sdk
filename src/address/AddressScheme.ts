/**
 * Indicates how an address should be interpreted by the SDK.
 */
export enum AddressScheme {
  /** Direct address pointing to a predicate reference. */
  DIRECT = 'DIRECT',
  /** Address pointing to a proxy object such as a name tag. */
  PROXY = 'PROXY',
}

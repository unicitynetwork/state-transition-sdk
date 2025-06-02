/**
 * Generic serialization contract used throughout the SDK.
 *
 * Objects implementing this interface can be encoded to CBOR and JSON
 * representations. Implementors should ensure that the returned values are
 * deterministic for the same instance.
 */
export interface ISerializable {
  /**
   * Encode the object into a CBOR byte array.
   *
   * @returns CBOR encoded representation of the object
   */
  toCBOR(): Uint8Array;

  /**
   * Convert the object into a JSON friendly structure.
   *
   * @returns Serializable JSON value
   */
  toJSON(): unknown;
}

export interface ISerializable {
  toCBOR(): Uint8Array;
  toJSON(): unknown;
}

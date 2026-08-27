import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { decodeInclusionProofOrAbsence, encodeNoCertifiedLeaf, InclusionProof } from './InclusionProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * What the aggregator answers when asked about a state.
 *
 * This is the wire shape, and it has two forms: a certified leaf, or the absence of one. Keeping
 * that distinction here rather than inside {@link InclusionProof} is what lets the proof itself be
 * complete by construction — a verifier that holds one never has to ask whether it describes a
 * leaf.
 */
export class InclusionProofResponse {
  /**
   * Create inclusion proof response.
   *
   * @param blockNumber Block number the answer was served at.
   * @param inclusionProof Certified leaf, or `null` when the state is not certified yet.
   * @param unicityCertificate Certificate of the round the answer was served against.
   */
  public constructor(
    public readonly blockNumber: bigint,
    public readonly inclusionProof: InclusionProof | null,
    public readonly unicityCertificate: UnicityCertificate,
  ) {}

  /**
   * Create response from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return inclusion proof response
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProofResponse {
    const data = CborDeserializer.decodeArray(bytes, 2);
    const { inclusionProof, unicityCertificate } = decodeInclusionProofOrAbsence(data[1]);

    return new InclusionProofResponse(
      CborDeserializer.decodeUnsignedInteger(data[0]),
      inclusionProof,
      unicityCertificate,
    );
  }

  /**
   * Convert InclusionProofResponse to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.blockNumber),
      this.inclusionProof?.toCBOR() ?? encodeNoCertifiedLeaf(this.unicityCertificate),
    );
  }
}

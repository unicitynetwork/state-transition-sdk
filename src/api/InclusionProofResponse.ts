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
  private constructor(
    public readonly blockNumber: bigint,
    public readonly inclusionProof: InclusionProof | null,
    public readonly unicityCertificate: UnicityCertificate,
  ) {}

  /**
   * The aggregator has certified this state.
   *
   * The round it was served against is the proof's own, so there is no second certificate to
   * supply and none that could disagree with it.
   *
   * @param {bigint} blockNumber Block number the answer was served at.
   * @param {InclusionProof} inclusionProof The certified leaf.
   * @returns {InclusionProofResponse} The response.
   */
  public static certified(blockNumber: bigint, inclusionProof: InclusionProof): InclusionProofResponse {
    return new InclusionProofResponse(blockNumber, inclusionProof, inclusionProof.unicityCertificate);
  }

  /**
   * Create response from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {InclusionProofResponse} Inclusion proof response.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProofResponse {
    const data = CborDeserializer.decodeArray(bytes, 2);
    const { inclusionProof, unicityCertificate } = decodeInclusionProofOrAbsence(data[1]);
    const blockNumber = CborDeserializer.decodeUnsignedInteger(data[0]);

    return inclusionProof == null
      ? InclusionProofResponse.notCertified(blockNumber, unicityCertificate)
      : InclusionProofResponse.certified(blockNumber, inclusionProof);
  }

  /**
   * The aggregator has not certified this state yet, so only the round is meaningful.
   *
   * @param {bigint} blockNumber Block number the answer was served at.
   * @param {UnicityCertificate} unicityCertificate Certificate of the round the answer was served against.
   * @returns {InclusionProofResponse} The response.
   */
  public static notCertified(blockNumber: bigint, unicityCertificate: UnicityCertificate): InclusionProofResponse {
    return new InclusionProofResponse(blockNumber, null, unicityCertificate);
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

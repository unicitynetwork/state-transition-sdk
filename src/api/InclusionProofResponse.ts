import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { CertificationData } from './CertificationData.js';
import { InclusionCertificate } from './InclusionCertificate.js';
import { InclusionProof } from './InclusionProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
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
    const blockNumber = CborDeserializer.decodeUnsignedInteger(data[0]);

    const tag = CborDeserializer.decodeTag(data[1]);
    if (tag.tag !== InclusionProof.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for InclusionProof: ${tag.tag}`);
    }
    const proof = CborDeserializer.decodeArray(tag.data, 5);
    const version = CborDeserializer.decodeUnsignedInteger(proof[0]);
    if (version !== InclusionProof.VERSION) {
      throw new CborError(`Unsupported InclusionProof version: ${version}`);
    }

    const certificationData = CborDeserializer.decodeNullable(proof[1], CertificationData.fromCBOR);
    const referenceTime = CborDeserializer.decodeNullable(proof[2], CborDeserializer.decodeUnsignedInteger);
    const inclusionCertificate = CborDeserializer.decodeNullable(proof[3], (certificate) =>
      InclusionCertificate.decode(CborDeserializer.decodeByteString(certificate)),
    );
    const unicityCertificate = UnicityCertificate.fromCBOR(proof[4]);

    // The three leaf fields travel together: all present once the request has been included in a
    // certified round, all absent while it is still pending. Anything in between is a protocol
    // violation, and rejecting it here is what lets InclusionProof require all three.
    const present = [certificationData, referenceTime, inclusionCertificate].filter((field) => field != null).length;
    if (present === 0) {
      return InclusionProofResponse.notCertified(blockNumber, unicityCertificate);
    }
    if (present !== 3) {
      throw new CborError(
        'InclusionProof must carry certification data, reference time and inclusion certificate together, or none of them.',
      );
    }

    return InclusionProofResponse.certified(
      blockNumber,
      new InclusionProof(
        certificationData as CertificationData,
        referenceTime as bigint,
        inclusionCertificate as InclusionCertificate,
        unicityCertificate,
      ),
    );
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
      this.inclusionProof?.toCBOR() ?? this.encodeNoCertifiedLeaf(),
    );
  }

  /**
   * Encode the wire form for a state with no certified leaf: the three leaf fields absent, the
   * round's certificate still present.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  private encodeNoCertifiedLeaf(): Uint8Array {
    return CborSerializer.encodeTag(
      InclusionProof.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(InclusionProof.VERSION),
        CborSerializer.encodeNull(),
        CborSerializer.encodeNull(),
        CborSerializer.encodeNull(),
        this.unicityCertificate.toCBOR(),
      ),
    );
  }
}

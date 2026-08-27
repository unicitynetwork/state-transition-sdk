import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { CertificationData } from './CertificationData.js';
import { InclusionCertificate } from './InclusionCertificate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Represents a proof of inclusion or non inclusion in a sparse merkle tree.
 */
export class InclusionProof {
  public static readonly CBOR_TAG = 39033n;
  public static readonly VERSION = 1n;

  /**
   * Constructs an InclusionProof instance.
   *
   * An InclusionProof describes a certified leaf, so every field is present. The aggregator's
   * answer for a state it has not certified yet is not an InclusionProof at all — see
   * {@link InclusionProofResponse}, which is the type that can express it.
   *
   * @param certificationData Certification data.
   * @param referenceTime Reference time of the round the leaf was created in, in Unix seconds.
   * @param inclusionCertificate Inclusion certificate.
   * @param unicityCertificate Unicity certificate.
   */
  public constructor(
    public readonly certificationData: CertificationData,
    public readonly referenceTime: bigint,
    public readonly inclusionCertificate: InclusionCertificate,
    public readonly unicityCertificate: UnicityCertificate,
  ) {}

  /**
   * @returns {bigint} Wire-format version of this inclusion proof.
   */
  public get version(): bigint {
    return InclusionProof.VERSION;
  }

  /**
   * Decodes an InclusionProof from CBOR bytes.
   *
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
   * @throws {CborError} If the bytes describe no certified leaf; use
   *   {@link decodeInclusionProofOrAbsence} where that is a legitimate answer.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProof {
    const { inclusionProof } = decodeInclusionProofOrAbsence(bytes);
    if (inclusionProof == null) {
      throw new CborError('Expected a certified leaf, but the inclusion proof reports none.');
    }

    return inclusionProof;
  }

  /**
   * Encodes the InclusionProof to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      InclusionProof.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.certificationData.toCBOR(),
        CborSerializer.encodeUnsignedInteger(this.referenceTime),
        CborSerializer.encodeByteString(this.inclusionCertificate.encode()),
        this.unicityCertificate.toCBOR(),
      ),
    );
  }

  /**
   * Returns a string representation of the InclusionProof.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Inclusion Proof
        Reference Time: ${this.referenceTime.toString()}
        ${this.inclusionCertificate.toString()}
        ${this.certificationData.toString()}
        ${this.unicityCertificate.toString()}`;
  }
}

/**
 * Decode the wire form, which expresses either a certified leaf or the absence of one.
 *
 * The three leaf fields travel together: all present once the request has been included in a
 * certified round, all absent while it is still pending. Anything in between is a protocol
 * violation and is rejected here, so nothing downstream has to consider a half-formed proof.
 *
 * @param {Uint8Array} bytes CBOR-encoded inclusion proof.
 * @returns {object} The proof, or `null` when no leaf is certified yet, and the unicity certificate.
 * @throws {CborError} On a wrong tag, an unsupported version, or a partially present proof.
 */
export function decodeInclusionProofOrAbsence(bytes: Uint8Array): {
  inclusionProof: InclusionProof | null;
  unicityCertificate: UnicityCertificate;
} {
  const tag = CborDeserializer.decodeTag(bytes);
  if (tag.tag !== InclusionProof.CBOR_TAG) {
    throw new CborError(`Invalid CBOR tag for InclusionProof: ${tag.tag}`);
  }

  const data = CborDeserializer.decodeArray(tag.data, 5);
  const version = CborDeserializer.decodeUnsignedInteger(data[0]);
  if (version !== InclusionProof.VERSION) {
    throw new CborError(`Unsupported InclusionProof version: ${version}`);
  }

  const certificationData = CborDeserializer.decodeNullable(data[1], CertificationData.fromCBOR);
  const referenceTime = CborDeserializer.decodeNullable(data[2], CborDeserializer.decodeUnsignedInteger);
  const inclusionCertificate = CborDeserializer.decodeNullable(data[3], (certificate) =>
    InclusionCertificate.decode(CborDeserializer.decodeByteString(certificate)),
  );
  const unicityCertificate = UnicityCertificate.fromCBOR(data[4]);

  const present = [certificationData, referenceTime, inclusionCertificate].filter((field) => field != null).length;
  if (present === 0) {
    return { inclusionProof: null, unicityCertificate };
  }
  if (present !== 3) {
    throw new CborError(
      'InclusionProof must carry certification data, reference time and inclusion certificate together, or none of them.',
    );
  }

  return {
    inclusionProof: new InclusionProof(
      certificationData as CertificationData,
      referenceTime as bigint,
      inclusionCertificate as InclusionCertificate,
      unicityCertificate,
    ),
    unicityCertificate,
  };
}

/**
 * Encode the wire form for a state with no certified leaf.
 *
 * @param {UnicityCertificate} unicityCertificate Certificate of the round the answer was served against.
 * @returns {Uint8Array} CBOR bytes.
 */
export function encodeNoCertifiedLeaf(unicityCertificate: UnicityCertificate): Uint8Array {
  return CborSerializer.encodeTag(
    InclusionProof.CBOR_TAG,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(InclusionProof.VERSION),
      CborSerializer.encodeNull(),
      CborSerializer.encodeNull(),
      CborSerializer.encodeNull(),
      unicityCertificate.toCBOR(),
    ),
  );
}

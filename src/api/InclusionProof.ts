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
   * The bytes must describe a certified leaf. The same wire form can also say that no leaf is
   * certified yet, but that is not an InclusionProof — {@link InclusionProofResponse} is the type
   * that carries it, and it decodes that case itself.
   *
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
   * @throws {CborError} On a wrong tag, an unsupported version, or bytes describing no leaf.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProof {
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
    if (certificationData == null || referenceTime == null || inclusionCertificate == null) {
      throw new CborError('Expected a certified leaf, but the inclusion proof describes none.');
    }

    return new InclusionProof(
      certificationData,
      referenceTime,
      inclusionCertificate,
      UnicityCertificate.fromCBOR(data[4]),
    );
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

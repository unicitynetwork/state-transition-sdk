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
  private static readonly VERSION = 1n;

  /**
   * Constructs an InclusionProof instance.
   * @param certificationData Certification data.
   * @param referenceTime Reference time of the round the leaf was created in.
   * @param inclusionCertificate Inclusion certificate.
   * @param unicityCertificate Unicity certificate.
   */
  public constructor(
    public readonly certificationData: CertificationData | null,
    public readonly referenceTime: bigint | null,
    public readonly inclusionCertificate: InclusionCertificate | null,
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
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
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

    return new InclusionProof(
      CborDeserializer.decodeNullable(data[1], CertificationData.fromCBOR),
      CborDeserializer.decodeNullable(data[2], CborDeserializer.decodeUnsignedInteger),
      CborDeserializer.decodeNullable(data[3], (inclusionCertificate) =>
        InclusionCertificate.decode(CborDeserializer.decodeByteString(inclusionCertificate)),
      ),
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
        CborSerializer.encodeNullable(this.certificationData, (certificationData) => certificationData.toCBOR()),
        CborSerializer.encodeNullable(this.referenceTime, (referenceTime) =>
          CborSerializer.encodeUnsignedInteger(referenceTime),
        ),
        CborSerializer.encodeNullable(this.inclusionCertificate, (inclusionCertificate) =>
          CborSerializer.encodeByteString(inclusionCertificate.encode()),
        ),
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
        Reference Time: ${this.referenceTime?.toString() ?? 'null'}
        ${this.inclusionCertificate?.toString()}
        ${this.certificationData?.toString()}
        ${this.unicityCertificate.toString()}`;
  }
}

import { CertificationData } from '../../../src/api/CertificationData.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { CborDeserializer } from '../../../src/serialization/cbor/CborDeserializer.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationData', () => {
  // Fixed so the golden encodings below stay stable.
  const EXPIRES_AT = 1755000000n;
  const PUBLIC_KEY = '02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026';

  function mint(expiresAt: bigint | null): Promise<MintTransaction> {
    return MintTransaction.create(NetworkId.MAINNET, SignaturePredicate.create(HexConverter.decode(PUBLIC_KEY)), {
      expiresAt,
      salt: TokenSalt.fromBytes(new Uint8Array(32)),
      tokenType: new TokenType(new Uint8Array(32)),
    });
  }

  // Shared with the Java, Rust and Go implementations: the same logical request
  // must produce these exact bytes everywhere. The explicit-deadline vector is
  // unchanged from the two-profile encoding; only the absent case moved, from a
  // shorter array to a null in the same slot.
  const EXPLICIT_VECTOR =
    'd998778602d9987883014101582103a19eef04b8856f50bf2d688b0d8804575115e53d2a7780da363628343f963507' +
    '5820e4b183ff6b7a399983cee26e4feea85d517dede0142def5c838e593a9e6152415820ed275ff0a0694d1b61ec22' +
    'f13914a431569220ba7f2f043d7940aac78d02c2f91a689b2cc0584111f0f7929d70e0e32db9159b7e23b6e0043502' +
    'bc36609728e9dc0353251c241a7b1adb047c9234cd77ed519c409048a6c8bc247f0262c1f161b03d6fee49426e00';
  const ABSENT_VECTOR =
    'd998778602d9987883014101582103a19eef04b8856f50bf2d688b0d8804575115e53d2a7780da363628343f963507' +
    '5820e4b183ff6b7a399983cee26e4feea85d517dede0142def5c838e593a9e6152415820c034e096d7bdf71ba75955' +
    '8663b5cafb7279ecb7e284443e5e6cbce0461aceeef6584154ca6b19a7dbcae7a6adc38af5c8672f81943ecaf51345' +
    '436684299b4b7ac81a57db2653f32048981e37913db4749ca08d998d1fac4a52ab5579988bc2c50de900';

  it('matches the shared cross-SDK vectors', async () => {
    const explicit = await CertificationData.fromMintTransaction(await mint(EXPIRES_AT));
    const absent = await CertificationData.fromMintTransaction(await mint(null));

    expect(HexConverter.encode(explicit.toCBOR())).toBe(EXPLICIT_VECTOR);
    expect(HexConverter.encode(absent.toCBOR())).toBe(ABSENT_VECTOR);
  });

  it('should encode and decode to exactly same object', async () => {
    const certificationData = await CertificationData.fromMintTransaction(await mint(EXPIRES_AT));
    const result = CertificationData.fromCBOR(certificationData.toCBOR());

    expect(EncodedPredicate.fromPredicate(result.lockScript).toCBOR()).toStrictEqual(
      EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
    );
    expect(result.sourceStateHash.imprint).toStrictEqual(certificationData.sourceStateHash.imprint);
    expect(result.transactionHash.imprint).toStrictEqual(certificationData.transactionHash.imprint);
    expect(result.expiresAt).toStrictEqual(EXPIRES_AT);
    expect(HexConverter.encode(result.unlockScript)).toStrictEqual(HexConverter.encode(certificationData.unlockScript));
  });

  // An omitted deadline holds its position as CBOR null rather than shortening
  // the array, so both requests are the same version with the same field count.
  it('encodes an absent deadline as null in the same shape', async () => {
    const withDeadline = await CertificationData.fromMintTransaction(await mint(EXPIRES_AT));
    const withoutDeadline = await CertificationData.fromMintTransaction(await mint(null));

    const encoded = withoutDeadline.toCBOR();
    expect(encoded[3]).toBe(withDeadline.toCBOR()[3]);
    expect(encoded[4]).toBe(2);
    // The deadline's own element, decoded rather than searched for: 'f6'
    // appears somewhere in a hash-and-signature payload of this length with
    // probability indistinguishable from one, so searching the hex asserts
    // nothing about how the absent deadline was encoded.
    const elements = CborDeserializer.decodeArray(CborDeserializer.decodeTag(encoded).data, 6);
    expect(HexConverter.encode(elements[4])).toBe('f6');

    const decoded = CertificationData.fromCBOR(encoded);
    expect(decoded.expiresAt).toBeNull();
    expect(HexConverter.encode(decoded.toCBOR())).toBe(HexConverter.encode(encoded));
  });

  it('does not read a clock when the deadline is omitted', async () => {
    const now = jest.spyOn(Date, 'now');
    try {
      await CertificationData.fromMintTransaction(await mint(null));
      expect(now).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('rejects any version other than the current one', async () => {
    const certificationData = await CertificationData.fromMintTransaction(await mint(EXPIRES_AT));

    for (const badVersion of [1, 3]) {
      const mismatched = certificationData.toCBOR();
      expect(mismatched[4]).toBe(2);
      mismatched[4] = badVersion;

      expect(() => CertificationData.fromCBOR(mismatched)).toThrow(
        `Unsupported CertificationData version: ${badVersion}`,
      );
    }
  });
});

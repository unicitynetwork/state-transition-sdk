import { CertificationData } from '../../../src/api/CertificationData.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationData', () => {
  // Fixed so the golden encoding below stays stable.
  const TIMEOUT = 1755000000n;

  it('should encode and decode to exactly same object', async () => {
    const certificationData = await CertificationData.fromMintTransaction(
      await MintTransaction.create(
        NetworkId.MAINNET,
        SignaturePredicate.create(
          HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
        ),
        TIMEOUT,
        null,
        new TokenType(new Uint8Array(32)),
        TokenSalt.fromBytes(new Uint8Array(32)),
      ),
    );
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      'd998778602d9987883014101582103a19eef04b8856f50bf2d688b0d8804575115e53d2a7780da363628343f9635075820e4b183ff6b7a399983cee26e4feea85d517dede0142def5c838e593a9e6152415820ed275ff0a0694d1b61ec22f13914a431569220ba7f2f043d7940aac78d02c2f91a689b2cc0584111f0f7929d70e0e32db9159b7e23b6e0043502bc36609728e9dc0353251c241a7b1adb047c9234cd77ed519c409048a6c8bc247f0262c1f161b03d6fee49426e00',
    );
    const result = CertificationData.fromCBOR(certificationData.toCBOR());

    expect(EncodedPredicate.fromPredicate(result.lockScript).toCBOR()).toStrictEqual(
      EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
    );
    expect(result.sourceStateHash.imprint).toStrictEqual(certificationData.sourceStateHash.imprint);
    expect(result.transactionHash.imprint).toStrictEqual(certificationData.transactionHash.imprint);
    expect(result.timeout).toStrictEqual(certificationData.timeout);
    expect(HexConverter.encode(result.unlockScript)).toStrictEqual(HexConverter.encode(certificationData.unlockScript));
  });

  it('preserves the legacy clock-free API and v1 wire format', async () => {
    const transaction = await MintTransaction.create(
      NetworkId.MAINNET,
      SignaturePredicate.create(
        HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
      ),
      null,
      new TokenType(new Uint8Array(32)),
      TokenSalt.fromBytes(new Uint8Array(32)),
    );
    const certificationData = await CertificationData.fromMintTransaction(transaction);
    const decoded = CertificationData.fromCBOR(certificationData.toCBOR());

    expect(transaction.version).toBe(1n);
    expect(transaction.timeout).toBeNull();
    expect(certificationData.version).toBe(1n);
    expect(decoded.timeout).toBeNull();
    expect(HexConverter.encode(certificationData.toCBOR())).toBe(
      'd998778501d9987883014101582103a19eef04b8856f50bf2d688b0d8804575115e53d2a7780da363628343f9635075820e4b183ff6b7a399983cee26e4feea85d517dede0142def5c838e593a9e6152415820df524cffc08a1dc30579a8a51f440a97b30630988084f8d12a4d8bd741c7791258419efb637f14dbdaada6e293e2182932d82265b04b1abf4f28bc4c285b32b5e2325140fe7f94bc9b705c568b4fcb7f9ea90cf0fadcacc1b4504275f81558aad1e700',
    );
  });

  it('rejects a version that does not match the field count', async () => {
    const certificationData = await CertificationData.fromMintTransaction(
      await MintTransaction.create(
        NetworkId.MAINNET,
        SignaturePredicate.create(
          HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
        ),
        TIMEOUT,
      ),
    );
    const mismatched = certificationData.toCBOR();
    expect(mismatched[4]).toBe(2);
    mismatched[4] = 1;

    expect(() => CertificationData.fromCBOR(mismatched)).toThrow(
      'Expected CertificationData array length 5 for version 1, got 6.',
    );
  });
});

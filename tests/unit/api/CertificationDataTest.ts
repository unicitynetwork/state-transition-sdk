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
      'd998778601d9987883014101582103a19eef04b8856f50bf2d688b0d8804575115e53d2a7780da363628343f9635075820e4b183ff6b7a399983cee26e4feea85d517dede0142def5c838e593a9e615241582068a39b55a025f3fc4ff80be2ee8231dbe02afe151279b19fc457d39a6281720b1a689b2cc05841ded0fa3fa2773d2e52d4db8918f883e50be7cdcd351b16bbded03bb2c54f80c130cb08befdfe0f6c78c2e925645f3804953ad41d6f043e9ab8aa81740cbd8f8800',
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
});

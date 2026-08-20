import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../src/api/CertificationRequest.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationRequest', () => {
  it('should encode object to expected CBOR bytes', async () => {
    const request = await CertificationRequest.create(
      CertificationData.fromCBOR(
        CborSerializer.encodeTag(
          CertificationData.CBOR_TAG,
          CborSerializer.encodeArray(
            CborSerializer.encodeUnsignedInteger(2),
            HexConverter.decode('D998788301410158210279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'),
            CborSerializer.encodeByteString(new Uint8Array(32)),
            CborSerializer.encodeByteString(new Uint8Array(32)),
            CborSerializer.encodeUnsignedInteger(1755000000),
            CborSerializer.encodeByteString(
              HexConverter.decode(
                '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
              ),
            ),
          ),
        ),
      ),
    );

    expect(HexConverter.encode(request.toCBOR())).toEqual(
      'd99876840158202266ed845b22d7ab6ba5d30e6a7bdd36465d64a0231e6304a5f27a4f7d348d07d998778602d998788301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179858200000000000000000000000000000000000000000000000000000000000000000582000000000000000000000000000000000000000000000000000000000000000001a689b2cc058418c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a0100',
    );
  });
});

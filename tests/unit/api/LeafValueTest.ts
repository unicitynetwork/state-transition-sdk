import { calculateLeafValue } from '../../../src/api/LeafValue.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('LeafValue', () => {
  // Shared across the Go, Rust and Java implementations: the leaf value is
  // SHA-256 over the deterministic CBOR array [transactionHash, referenceTime].
  const TRANSACTION_HASH = new DataHash(
    HashAlgorithm.SHA256,
    HexConverter.decode('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
  );
  const REFERENCE_TIME = 1755000000n;
  const EXPECTED = '0235bd52cfa10c9785dfa01942bc396f201fe715dbc3896ee117a97e895e1e36';

  it('matches the shared test vector', async () => {
    const leafValue = await calculateLeafValue(TRANSACTION_HASH, REFERENCE_TIME);

    expect(HexConverter.encode(leafValue.data)).toEqual(EXPECTED);
  });

  it('changes with the reference time', async () => {
    const leafValue = await calculateLeafValue(TRANSACTION_HASH, REFERENCE_TIME + 1n);

    expect(HexConverter.encode(leafValue.data)).not.toEqual(EXPECTED);
  });
});

import {
  buildToken,
  EXPIRES_AT,
  hasVector,
  readVector,
  REFERENCE_TIME,
  WRITING,
  writeVector,
} from './InteropFixture.js';
import { Token } from '../../src/transaction/Token.js';
import { HexConverter } from '../../src/util/HexConverter.js';

const TOKEN = 'js-token-v2.cbor';
const TRUST_BASE = 'js-token-v2.trust-base.json';

/**
 * The producing half of the cross-SDK interop vectors: this SDK's token, pinned.
 *
 * Regenerate with `INTEROP_WRITE=true npm run test:interop`. The committed bytes are what the
 * Java SDK's consuming test reads, so changing them is a deliberate act: if this fails, either
 * the wire format changed — in which case the Java vectors move with it — or something that was
 * supposed to be deterministic is not.
 */
describe('Interop vectors produced here', () => {
  it('token matches the committed vector', async () => {
    const { token, trustBaseJson } = await buildToken();
    const encoded = token.toCBOR();

    if (WRITING) {
      writeVector(TOKEN, encoded);
      writeVector(TRUST_BASE, trustBaseJson);

      return;
    }

    expect(hasVector(TOKEN)).toBe(true);
    expect(HexConverter.encode(encoded)).toBe(HexConverter.encode(readVector(TOKEN)));
  }, 30000);

  it('pins the container shape both SDKs must agree on', async () => {
    const { token } = await buildToken();

    // Token is a 3-element tagged array whose version is 2, and each certified transaction inside
    // it is 2 elements. That is the whole of what diverged between the SDKs.
    expect(token.version).toEqual(2n);
    expect(token.genesis.expiresAt).toEqual(EXPIRES_AT);
    expect(token.genesis.referenceTime).toEqual(REFERENCE_TIME);
    expect(token.transactions).toHaveLength(1);

    const round = await Token.fromCBOR(token.toCBOR());
    expect(HexConverter.encode(round.toCBOR())).toBe(HexConverter.encode(token.toCBOR()));
  }, 30000);
});

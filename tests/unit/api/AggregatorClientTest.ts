import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { StateId } from '../../../src/api/StateId.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';

describe('AggregatorClient', () => {
  it('should reject an API key over plaintext HTTP', () => {
    expect(() => new AggregatorClient('http://example.com', 'secret-key')).toThrow();
  });

  it('should allow an API key over HTTPS', () => {
    expect(() => new AggregatorClient('https://example.com', 'secret-key')).not.toThrow();
  });

  it('should allow a plaintext HTTP URL when no API key is set', () => {
    expect(() => new AggregatorClient('http://example.com')).not.toThrow();
  });

  it('should allow an API key over plaintext HTTP when insecure transport is enabled', () => {
    expect(() => new AggregatorClient('http://localhost:3000', 'secret-key', true)).not.toThrow();
  });

  it('should forward the abort signal of an inclusion proof request to fetch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    try {
      const client = new AggregatorClient('https://example.com');
      const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32)));
      const controller = new AbortController();

      await expect(client.getInclusionProof(stateId, { signal: controller.signal })).rejects.toThrow();
      expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('should not expose the API key on inspection', () => {
    const client = new AggregatorClient('https://example.com', 'secret-key');

    expect(JSON.stringify(client)).not.toContain('secret-key');
    expect(Object.keys(client)).not.toContain('key');
    expect(Object.values(client)).not.toContain('secret-key');
  });
});

import { JsonRpcHttpTransport } from '../../../../src/api/json-rpc/JsonRpcHttpTransport.js';

describe('JsonRpcHttpTransport', () => {
  const transport = new JsonRpcHttpTransport('https://example.com');
  const fetchMock = jest.spyOn(global, 'fetch');

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  const respondWith = (payload: (id: unknown) => Record<string, unknown>, status = 200): void => {
    fetchMock.mockImplementation((_input, init) => {
      const id = (JSON.parse(init?.body as string) as { id: unknown }).id;
      return Promise.resolve(new Response(JSON.stringify(payload(id)), { status }));
    });
  };

  it('should return the result on a valid response', async () => {
    respondWith((id) => ({ id, jsonrpc: '2.0', result: 'ok' }));
    await expect(transport.request('m', {})).resolves.toBe('ok');
  });

  it('should reject an unsupported jsonrpc version', async () => {
    respondWith((id) => ({ id, jsonrpc: '1.0', result: 'ok' }));
    await expect(transport.request('m', {})).rejects.toThrow('Unsupported JSON-RPC version');
  });

  it('should reject a mismatched response id', async () => {
    respondWith(() => ({ id: 'other', jsonrpc: '2.0', result: 'ok' }));
    await expect(transport.request('m', {})).rejects.toThrow('id mismatch');
  });

  it('should reject a response with both result and error', async () => {
    respondWith((id) => ({ error: { code: 1, message: 'x' }, id, jsonrpc: '2.0', result: 'ok' }));
    await expect(transport.request('m', {})).rejects.toThrow('exactly one of result or error');
  });

  it('should reject a response with neither result nor error', async () => {
    respondWith((id) => ({ id, jsonrpc: '2.0' }));
    await expect(transport.request('m', {})).rejects.toThrow('exactly one of result or error');
  });

  it('should surface a JSON-RPC error object', async () => {
    respondWith((id) => ({ error: { code: -1, message: 'boom' }, id, jsonrpc: '2.0' }));
    await expect(transport.request('m', {})).rejects.toThrow('boom');
  });

  it('should forward the abort signal to fetch', async () => {
    respondWith((id) => ({ id, jsonrpc: '2.0', result: 'ok' }));
    const controller = new AbortController();

    await expect(transport.request('m', {}, new Headers(), { signal: controller.signal })).resolves.toBe('ok');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('should reject once the request is aborted', async () => {
    fetchMock.mockImplementation((_input, init) => {
      const { signal } = init ?? {};
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
      });
    });
    const controller = new AbortController();
    const request = transport.request('m', {}, new Headers(), { signal: controller.signal });
    controller.abort(new Error('aborted by caller'));

    await expect(request).rejects.toThrow('aborted by caller');
  });

  it('should decode a multi-byte UTF-8 character split across stream chunks', async () => {
    fetchMock.mockImplementation((_input, init) => {
      const id = (JSON.parse((init?.body as string) ?? '{}') as { id: unknown }).id;
      // '🎉' (U+1F389) is the 4-byte sequence F0 9F 8E 89.
      const bytes = new TextEncoder().encode(JSON.stringify({ id, jsonrpc: '2.0', result: '🎉' }));
      const splitAt = bytes.indexOf(0xf0) + 2; // mid-emoji: F0 9F | 8E 89
      const stream = new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>): void {
          controller.enqueue(bytes.slice(0, splitAt));
          controller.enqueue(bytes.slice(splitAt));
          controller.close();
        },
      });
      return Promise.resolve(new Response(stream));
    });

    await expect(transport.request('m', {})).resolves.toBe('🎉');
  });
});

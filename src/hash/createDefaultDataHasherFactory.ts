import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { SubtleCryptoDataHasher } from '@unicitylabs/commons/lib/hash/SubtleCryptoDataHasher.js';
import type { IDataHasher } from '@unicitylabs/commons/lib/hash/IDataHasher.js';

/**
 * Create a DataHasherFactory that selects the appropriate implementation
 * depending on the environment. Browsers will use the Web Crypto based
 * {@link SubtleCryptoDataHasher} while Node.js will fall back to
 * {@link NodeDataHasher}.
 */
export function createDefaultDataHasherFactory(): DataHasherFactory<IDataHasher> {
  const isBrowser = typeof window !== 'undefined' && typeof window.crypto !== 'undefined';
  const Hasher = isBrowser ? SubtleCryptoDataHasher : NodeDataHasher;
  return new DataHasherFactory(Hasher as any);
}

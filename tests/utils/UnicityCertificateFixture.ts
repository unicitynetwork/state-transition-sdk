import { numberToBytesBE } from '@noble/curves/utils.js';

import { REFERENCE_TIME } from './ReferenceTime.js';
import { InputRecord } from '../../src/api/bft/InputRecord.js';
import { ShardId } from '../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../src/api/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../src/api/bft/UnicityTreeCertificate.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { DataHash } from '../../src/crypto/hash/DataHash.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';

export async function createUnicityCertificate(
  rootHash: DataHash,
  signingService: SigningService,
  timestamp: bigint = REFERENCE_TIME,
): Promise<UnicityCertificate> {
  const inputRecord = new InputRecord(0n, 0n, null, rootHash.data, new Uint8Array(0), timestamp, null, 0n, null);
  const technicalRecordHash = null;
  const shardConfigurationHash = new Uint8Array(32);
  const shardTreeCertificate = new ShardTreeCertificate(ShardId.decode(new Uint8Array([0b10000000])), []);

  const shardTreeCertificateRootHash = await UnicityCertificate.calculateShardTreeCertificateRootHash(
    inputRecord,
    technicalRecordHash,
    shardConfigurationHash,
    shardTreeCertificate,
  );

  const partitionIdentifier = 0n;

  const key = numberToBytesBE(partitionIdentifier, 4);
  const shardTreeCertificateRootCborHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(shardTreeCertificateRootHash.data))
    .digest();

  const unicitySealHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(new Uint8Array([0x01])))
    .update(CborSerializer.encodeByteString(key))
    .update(CborSerializer.encodeByteString(shardTreeCertificateRootCborHash.data))
    .digest();

  const seal = await UnicitySeal.create(
    NetworkId.LOCAL,
    0n,
    0n,
    0n,
    null,
    unicitySealHash.data,
    new Map([['NODE', signingService]]),
  );

  return new UnicityCertificate(
    inputRecord,
    technicalRecordHash,
    shardConfigurationHash,
    shardTreeCertificate,
    new UnicityTreeCertificate(partitionIdentifier, []),
    seal,
  );
}

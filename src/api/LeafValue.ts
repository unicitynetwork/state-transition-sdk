import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * Calculate the sparse Merkle tree leaf value the Unicity Service records for an
 * accepted certification request.
 *
 * The value binds the reference time the request was validated under, not the
 * transaction hash alone. The tree is append-only, so a leaf can be certified
 * afresh against any later root and a later inclusion proof carries a later
 * round's reference time. Binding the reference time into the leaf value fixes
 * the value the transition was validated under, for any proof of that leaf.
 *
 * @param {DataHash} transactionHash Transaction hash of the certified request.
 * @param {bigint} referenceTime Reference time of the round the request was validated in.
 * @returns {Promise<DataHash>} Leaf value.
 */
export function calculateLeafValue(transactionHash: DataHash, referenceTime: bigint): Promise<DataHash> {
  return new DataHasher(HashAlgorithm.SHA256)
    .update(
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(transactionHash.data),
        CborSerializer.encodeUnsignedInteger(referenceTime),
      ),
    )
    .digest();
}

import { DuplicateSplitTokenIdError } from './error/DuplicateSplitTokenIdError.js';
import { TokenAssetCountMismatchError } from './error/TokenAssetCountMismatchError.js';
import { TokenAssetMissingError } from './error/TokenAssetMissingError.js';
import { TokenAssetValueMismatchError } from './error/TokenAssetValueMismatchError.js';
import { IPaymentData } from './IPaymentData.js';
import { SplitAllocationProof } from './SplitAllocationProof.js';
import { SplitManifest } from './SplitManifest.js';
import { SplitMintJustification } from './SplitMintJustification.js';
import { SplitToken } from './SplitToken.js';
import { SplitTokenRequest } from './SplitTokenRequest.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { BurnPredicate } from '../predicate/builtin/BurnPredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { SparseMerkleSumTree } from '../smt/radixsum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../smt/radixsum/SparseMerkleSumTreeRootNode.js';
import { StateMask } from '../transaction/StateMask.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Result of splitting a token.
 */
export interface ISplit {
  readonly burn: {
    readonly ownerPredicate: BurnPredicate;
    readonly transaction: TransferTransaction;
  };
  readonly tokens: SplitToken[];
}

/**
 * Token splitting. Burns the source token and prepares value-conserving output
 * mints, building one radix sparse Merkle sum tree per source asset so that, for
 * each asset, the outputs provably sum to the source amount.
 */
export class TokenSplit {
  /**
   * Split a token into new outputs.
   *
   * @param {Token} token Source token to split (the token being burned).
   * @param {(bytes: Uint8Array) => Promise<IPaymentData>} decodePaymentData Decoder for the source token's payment data.
   * @param {SplitTokenRequest[]} requests Per-output mint requests; each carries its own payment data.
   * @param {StateMask} [burnStateMask] State mask for the burn transaction. Defaults to a random
   *   value; callers needing a crash-resumable (re-buildable) split supply a deterministically
   *   derived mask so the identical burn transaction can be reconstructed after a failure.
   * @returns {Promise<ISplit>} Burn transaction and split tokens ready to mint.
   */
  public static split(
    token: Token,
    decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
    requests: SplitTokenRequest[],
    burnStateMask?: StateMask,
  ): Promise<ISplit>;
  public static split(
    token: Token,
    decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
    requests: SplitTokenRequest[],
    burnTimeout: bigint,
    burnStateMask?: StateMask,
  ): Promise<ISplit>;
  public static async split(
    token: Token,
    decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
    requests: SplitTokenRequest[],
    burnTimeoutOrStateMask: bigint | StateMask = StateMask.generate(),
    explicitStateMask: StateMask = StateMask.generate(),
  ): Promise<ISplit> {
    const burnTimeout = typeof burnTimeoutOrStateMask === 'bigint' ? burnTimeoutOrStateMask : null;
    const burnStateMask = (burnTimeout == null ? burnTimeoutOrStateMask : explicitStateMask) as StateMask;
    const factory = new DataHasherFactory(HashAlgorithm.SHA256, DataHasher);

    if (token.genesis.data == null) {
      throw new Error('Payment data is missing.');
    }

    const sourcePayment = await decodePaymentData(token.genesis.data);

    const sourceAssets = sourcePayment.assets.toArray();
    const sourceAssetKeys = new Set(sourceAssets.map((asset) => HexConverter.encode(asset.id.bytes)));

    const trees = new Map<string, SparseMerkleSumTree>();
    const usedTokenIdList = new Set<string>();
    const tokenIds: TokenId[] = [];

    for (const request of requests) {
      const tokenId = await TokenId.fromSalt(token.networkId, request.salt);
      tokenIds.push(tokenId);
      const tokenIdKey = HexConverter.encode(tokenId.bytes);
      if (usedTokenIdList.has(tokenIdKey)) {
        throw new DuplicateSplitTokenIdError(tokenId.toString());
      }
      usedTokenIdList.add(tokenIdKey);

      const recipient = EncodedPredicate.fromPredicate(request.recipient);
      const data = await request.paymentData.encode();
      const assets = request.paymentData.assets.toArray();

      const leafData = await SplitMintJustification.calculateLeafData(token, recipient, request.salt, tokenId, data);

      for (const asset of assets) {
        const assetKey = HexConverter.encode(asset.id.bytes);
        if (!sourceAssetKeys.has(assetKey)) {
          throw new TokenAssetMissingError(asset.id);
        }

        let tree = trees.get(assetKey);
        if (!tree) {
          tree = new SparseMerkleSumTree(factory);
          trees.set(assetKey, tree);
        }
        await tree.addLeaf(tokenId.bytes, leafData, asset.value);
      }
    }

    if (trees.size !== sourceAssets.length) {
      throw new TokenAssetCountMismatchError();
    }

    const roots: DataHash[] = [];
    const rootByAsset = new Map<string, SparseMerkleSumTreeRootNode>();
    for (const asset of sourceAssets) {
      const assetKey = HexConverter.encode(asset.id.bytes);
      const tree = trees.get(assetKey);
      if (!tree) {
        throw new TokenAssetMissingError(asset.id);
      }

      const root = await tree.calculateRoot();
      if (root.value !== asset.value) {
        throw new TokenAssetValueMismatchError(asset.id, asset.value, root.value);
      }

      roots.push(root.hash);
      rootByAsset.set(assetKey, root);
    }

    const manifestBytes = SplitManifest.create(roots).toCBOR();
    const burnReason = (await new DataHasher(HashAlgorithm.SHA256).update(manifestBytes).digest()).data;
    const burnPredicate = BurnPredicate.create(burnReason);
    const burnTransaction =
      burnTimeout == null
        ? await TransferTransaction.create(token, burnPredicate, burnStateMask, manifestBytes)
        : await TransferTransaction.create(token, burnPredicate, burnStateMask, burnTimeout, manifestBytes);

    const tokens: SplitToken[] = [];
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      const tokenId = tokenIds[i];
      const proofs = request.paymentData.assets
        .toArray()
        .map((asset) =>
          SplitAllocationProof.create(rootByAsset.get(HexConverter.encode(asset.id.bytes))!, tokenId.bytes),
        );

      tokens.push(
        new SplitToken(token.networkId, request.recipient, token.type, request.salt, request.paymentData, proofs),
      );
    }

    return {
      burn: {
        ownerPredicate: burnPredicate,
        transaction: burnTransaction,
      },
      tokens,
    };
  }
}

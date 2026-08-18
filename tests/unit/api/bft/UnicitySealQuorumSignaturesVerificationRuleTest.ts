import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { VerifiedSealCache } from '../../../../src/api/bft/verification/VerifiedSealCache.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createRootTrustBase } from '../../../utils/RootTrustBaseFixture.js';

/** Seal body shared by every seal built here, so their content hashes match. */
const SEAL_CONTENT_HASH = new Uint8Array(32).fill(0x11);

function signingServiceFrom(fill: number): SigningService {
  return new SigningService(new Uint8Array(32).fill(fill));
}

function sealSignedBy(signingService: SigningService): Promise<UnicitySeal> {
  return UnicitySeal.create(NetworkId.LOCAL, 0n, 0n, 0n, null, SEAL_CONTENT_HASH, new Map([['NODE', signingService]]));
}

describe('UnicitySealQuorumSignaturesVerificationRule', () => {
  const rootNode = signingServiceFrom(0x01);
  const impostor = signingServiceFrom(0x02);

  let signatureVerifier: Secp256k1SignatureVerifier;
  let verifySpy: jest.SpyInstance;
  let rule: UnicitySealQuorumSignaturesVerificationRule;

  beforeEach(() => {
    signatureVerifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(signatureVerifier, 'verify');
    rule = new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier, new VerifiedSealCache(256));
  });

  it('verifies a quorum seal, then serves the repeat from the memo', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    const first = await rule.verify(trustBase, seal);
    expect(first.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const second = await rule.verify(trustBase, seal);
    expect(second.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('verifies every seal afresh when constructed without a cache', async () => {
    const uncached = new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier);
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    expect((await uncached.verify(trustBase, seal)).status).toEqual(VerificationStatus.OK);
    expect((await uncached.verify(trustBase, seal)).status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });

  // The memo must key on the seal's COMPLETE encoding, not on calculateHash():
  // that hash deliberately excludes the signatures (it is what the root nodes
  // sign), so two seals with the same body but different signatures share it.
  // Keyed on it, this forged seal would be served a cached OK and its bogus
  // signatures would never be checked.
  it('rejects a seal whose signatures were replaced, even after the genuine one was memoised', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const genuine = await sealSignedBy(rootNode);
    const forged = await sealSignedBy(impostor);

    // The trap: identical bodies, hence identical signature-excluding hashes.
    expect((await forged.calculateHash()).toString()).toEqual((await genuine.calculateHash()).toString());

    expect((await rule.verify(trustBase, genuine)).status).toEqual(VerificationStatus.OK);
    expect((await rule.verify(trustBase, forged)).status).toEqual(VerificationStatus.FAIL);
  });

  // The trust base is keyed by content, not identity: `_rootNodes` is an
  // exposed Map and `readonly` stops only reassignment, so an in-place edit of
  // the root keys must invalidate the memo rather than keep hitting a verdict
  // computed under the old ones.
  it('re-verifies after the trust base is mutated in place', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    expect((await rule.verify(trustBase, seal)).status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    // Swap the root node's key for one that did not sign this seal, mutating
    // the exposed Map in place exactly as an application could.
    trustBase._rootNodes.set('NODE', createRootTrustBase(impostor.publicKey)._rootNodes.get('NODE')!);

    expect((await rule.verify(trustBase, seal)).status).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });

  it('keeps separate rules from sharing a memo', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    await rule.verify(trustBase, seal);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const otherVerifier = new Secp256k1SignatureVerifier();
    const otherSpy = jest.spyOn(otherVerifier, 'verify');
    const otherRule = new UnicitySealQuorumSignaturesVerificationRule(otherVerifier, new VerifiedSealCache(256));

    expect((await otherRule.verify(trustBase, seal)).status).toEqual(VerificationStatus.OK);
    expect(otherSpy).toHaveBeenCalledTimes(1);
  });

  it('does not memoise a seal that fails to reach quorum', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(impostor);

    expect((await rule.verify(trustBase, seal)).status).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    expect((await rule.verify(trustBase, seal)).status).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once the cache is full', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const small = new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier, new VerifiedSealCache(1));
    const first = await sealSignedBy(rootNode);
    const second = await UnicitySeal.create(
      NetworkId.LOCAL,
      1n,
      0n,
      0n,
      null,
      SEAL_CONTENT_HASH,
      new Map([['NODE', rootNode]]),
    );

    await small.verify(trustBase, first);
    await small.verify(trustBase, second);
    expect(verifySpy).toHaveBeenCalledTimes(2);

    // `first` was evicted by `second`, so it must be verified again.
    await small.verify(trustBase, first);
    expect(verifySpy).toHaveBeenCalledTimes(3);
  });
});

describe('VerifiedSealCache', () => {
  it('rejects a non-positive bound', () => {
    expect(() => new VerifiedSealCache(0)).toThrow('VerifiedSealCache maxEntries must be a positive integer');
    expect(() => new VerifiedSealCache(1.5)).toThrow('VerifiedSealCache maxEntries must be a positive integer');
  });
});

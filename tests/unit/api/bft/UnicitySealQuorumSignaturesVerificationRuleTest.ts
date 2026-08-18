import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
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

  beforeEach(() => {
    // A fresh verifier per test: the memo is keyed on the verifier instance, so
    // this isolates each test from the others' cached verdicts.
    signatureVerifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(signatureVerifier, 'verify');
  });

  it('verifies a quorum seal, then serves the repeat from the memo', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    const first = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal);
    expect(first.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const second = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal);
    expect(second.status).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);
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

    expect(
      (await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, genuine)).status,
    ).toEqual(VerificationStatus.OK);

    const result = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, forged);
    expect(result.status).toEqual(VerificationStatus.FAIL);
  });

  // The trust base is keyed by content, not identity: `_rootNodes` is an
  // exposed Map and `readonly` stops only reassignment, so an in-place edit of
  // the root keys must invalidate the memo rather than keep hitting a verdict
  // computed under the old ones.
  it('re-verifies after the trust base is mutated in place', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    expect(
      (await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal)).status,
    ).toEqual(VerificationStatus.OK);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    // Swap the root node's key for one that did not sign this seal, mutating
    // the exposed Map in place exactly as an application could.
    trustBase._rootNodes.set('NODE', createRootTrustBase(impostor.publicKey)._rootNodes.get('NODE')!);

    const result = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal);
    expect(result.status).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });

  it('does not memoise across signature verifiers, which need not agree', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(rootNode);

    await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const other = new Secp256k1SignatureVerifier();
    const otherSpy = jest.spyOn(other, 'verify');
    const result = await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, other, seal);

    expect(result.status).toEqual(VerificationStatus.OK);
    expect(otherSpy).toHaveBeenCalledTimes(1);
  });

  it('does not memoise a seal that fails to reach quorum', async () => {
    const trustBase = createRootTrustBase(rootNode.publicKey);
    const seal = await sealSignedBy(impostor);

    expect(
      (await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal)).status,
    ).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    expect(
      (await UnicitySealQuorumSignaturesVerificationRule.verify(trustBase, signatureVerifier, seal)).status,
    ).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });
});

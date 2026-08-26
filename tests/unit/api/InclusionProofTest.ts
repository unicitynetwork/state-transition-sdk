import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { InclusionCertificate } from '../../../src/api/InclusionCertificate.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { calculateLeafValue } from '../../../src/api/LeafValue.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { DataHasherFactory } from '../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/crypto/hash/NodeDataHasher.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTree } from '../../../src/smt/radix/SparseMerkleTree.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../../../src/transaction/verification/rule/InclusionProofVerificationRule.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { expiresAt } from '../../utils/ExpiresAt.js';
import { REFERENCE_TIME } from '../../utils/ReferenceTime.js';
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

describe('InclusionProof', () => {
  const signingService = new SigningService(
    new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
  );

  let predicateVerifier: PredicateVerifierService;
  let unicityCertificateVerifier: UnicityCertificateVerifier;
  let transaction: MintTransaction;
  let certificationData: CertificationData;
  let inclusionCertificate: InclusionCertificate;
  let unicityCertificate: UnicityCertificate;
  let rootHash: DataHash;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    transaction = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.fromSigningService(signingService), {
      expiresAt: expiresAt(),
    });
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await StateId.fromTransaction(transaction);
    certificationData = await CertificationData.fromMintTransaction(transaction);

    await smt.addLeaf(stateId.data, (await calculateLeafValue(certificationData.transactionHash, REFERENCE_TIME)).data);

    const root = await smt.calculateRoot();
    rootHash = root.hash;

    inclusionCertificate = InclusionCertificate.create(root, stateId.data);

    unicityCertificate = await createUnicityCertificate(rootHash, signingService);
    trustBase = createRootTrustBase(signingService.publicKey);
    predicateVerifier = PredicateVerifierService.create();
    unicityCertificateVerifier = createUnicityCertificateVerifier();
  });

  it('should encode and decode cbor', () => {
    const inclusionProof = new InclusionProof(
      CertificationData.fromCBOR(certificationData.toCBOR()),
      REFERENCE_TIME,
      inclusionCertificate,
      unicityCertificate,
    );

    expect(InclusionProof.fromCBOR(inclusionProof.toCBOR())).toStrictEqual(inclusionProof);

    expect(InclusionProof.fromCBOR(new InclusionProof(null, null, null, unicityCertificate).toCBOR())).toStrictEqual(
      new InclusionProof(null, null, null, unicityCertificate),
    );
  });

  // A proof either establishes a leaf or reports that there is none yet. The
  // aggregators emit all three leaf fields together or none of them, so a
  // partially present proof is a protocol violation and is rejected at decode
  // rather than surfacing as a null somewhere downstream.
  it('rejects a partially present proof', () => {
    const partial = [
      new InclusionProof(certificationData, REFERENCE_TIME, null, unicityCertificate),
      new InclusionProof(certificationData, null, inclusionCertificate, unicityCertificate),
      new InclusionProof(null, REFERENCE_TIME, inclusionCertificate, unicityCertificate),
      new InclusionProof(null, null, inclusionCertificate, unicityCertificate),
    ];

    for (const proof of partial) {
      expect(() => InclusionProof.fromCBOR(proof.toCBOR())).toThrow(
        'InclusionProof must carry certification data, reference time and inclusion certificate together, or none of them.',
      );
    }
  });

  it('verifies', async () => {
    const transactionHash = await transaction.calculateTransactionHash();
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(certificationData, REFERENCE_TIME, inclusionCertificate, unicityCertificate),
        transactionHash,
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.OK);

    // What the aggregator returns for a state it has not certified yet: all
    // three leaf fields absent together. The one status a caller polls through.
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(null, null, null, unicityCertificate),
        transactionHash,
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING);
  });

  // A proof with some leaf fields but not others establishes neither a leaf nor
  // its absence. fromCBOR rejects one off the wire, so these are reachable only
  // hand-built, and each has to name what is missing rather than pass for
  // "not certified yet" and leave the caller polling to its own deadline.
  it.each([
    [null, REFERENCE_TIME, true, InclusionProofVerificationStatus.MISSING_CERTIFICATION_DATA],
    [true, null, true, InclusionProofVerificationStatus.MISSING_REFERENCE_TIME],
    [true, REFERENCE_TIME, false, InclusionProofVerificationStatus.INCOMPLETE_INCLUSION_PROOF],
  ])('reports what a partially present proof is missing', async (hasData, referenceTime, hasCertificate, status) => {
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(
          hasData ? certificationData : null,
          referenceTime,
          hasCertificate ? inclusionCertificate : null,
          unicityCertificate,
        ),
        await transaction.calculateTransactionHash(),
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(status);
  });

  it('verification fails with invalid transaction hash', async () => {
    const invalidTransactionHashInclusionProof = new InclusionProof(
      CertificationData.fromCBOR(
        CborSerializer.encodeTag(
          CertificationData.CBOR_TAG,
          CborSerializer.encodeArray(
            CborSerializer.encodeUnsignedInteger(2n),
            EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
            CborSerializer.encodeByteString(certificationData.sourceStateHash.data),
            CborSerializer.encodeByteString(
              DataHash.fromImprint(
                HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
              ).data,
            ),
            CborSerializer.encodeUnsignedInteger(certificationData.expiresAt!),
            CborSerializer.encodeByteString(certificationData.unlockScript),
          ),
        ),
      ),
      REFERENCE_TIME,
      inclusionCertificate,
      unicityCertificate,
    );
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        invalidTransactionHashInclusionProof,
        await transaction.calculateTransactionHash(),
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH);
  });

  it('verification fails with invalid unlock script', async () => {
    const inclusionProof = new InclusionProof(
      CertificationData.fromCBOR(
        CborSerializer.encodeTag(
          CertificationData.CBOR_TAG,
          CborSerializer.encodeArray(
            CborSerializer.encodeUnsignedInteger(2n),
            EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
            CborSerializer.encodeByteString(certificationData.sourceStateHash.data),
            CborSerializer.encodeByteString(certificationData.transactionHash.data),
            CborSerializer.encodeUnsignedInteger(certificationData.expiresAt!),
            CborSerializer.encodeByteString(new Uint8Array(65)),
          ),
        ),
      ),
      REFERENCE_TIME,
      inclusionCertificate,
      unicityCertificate,
    );

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        inclusionProof,
        await transaction.calculateTransactionHash(),
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  // A leaf cannot postdate the round that certified it, and consensus signs
  // that round's timestamp, so a leaf claiming to be newer than its own round
  // is an impossible pairing and is rejected.
  it('verification fails when the leaf claims a reference time after its certifying round', async () => {
    // Same certified root, but the round certifying it reports a clock earlier
    // than the leaf claims to have been created at.
    const backDatedRound = await createUnicityCertificate(rootHash, signingService, REFERENCE_TIME - 1n);

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(certificationData, REFERENCE_TIME, inclusionCertificate, backDatedRound),
        await transaction.calculateTransactionHash(),
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.REFERENCE_TIME_AFTER_ROUND);
  });

  // Documents a gap this rule does NOT close, so that it stays visible and this
  // test fails loudly if it is ever closed.
  //
  // The bound above is one-sided, and the useful direction is the other one. A
  // service that receives a request after its deadline can insert the leaf now
  // and write a pre-deadline reference time into it: the expiry check passes
  // because that value is below the deadline, the bound above passes because
  // the certifying round is later still, and the SMT path authenticates the
  // value the service chose rather than when it chose it. Closing this needs
  // signed evidence of the creation round, which an inclusion proof does not
  // carry.
  it('accepts a leaf back-dated by a dishonest service, which it cannot detect', async () => {
    const deadline = REFERENCE_TIME;
    const backDated = deadline - 1n;
    const late = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.fromSigningService(signingService), {
      expiresAt: deadline,
      salt: transaction.salt,
      tokenType: transaction.tokenType,
    });
    const lateCertificationData = await CertificationData.fromMintTransaction(late);
    const stateId = await StateId.fromTransaction(late);

    // Built now, but claiming to have been created before the deadline.
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    await smt.addLeaf(stateId.data, (await calculateLeafValue(lateCertificationData.transactionHash, backDated)).data);
    const root = await smt.calculateRoot();

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(
          lateCertificationData,
          backDated,
          InclusionCertificate.create(root, stateId.data),
          // A round certified long after the deadline had passed.
          await createUnicityCertificate(root.hash, signingService, deadline + 4000n),
        ),
        await late.calculateTransactionHash(),
        late.expiresAt,
        late.lockScript,
        late.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.OK);
  });

  it('verification fails when the reference time has reached the request timeout', async () => {
    // A leaf whose deadline the round it was created in had already reached.
    // The deadline is exclusive, so equality is already too late.
    const expired = await MintTransaction.create(
      NetworkId.LOCAL,
      SignaturePredicate.fromSigningService(signingService),
      { expiresAt: REFERENCE_TIME, salt: transaction.salt, tokenType: transaction.tokenType },
    );
    const expiredCertificationData = await CertificationData.fromMintTransaction(expired);
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await StateId.fromTransaction(expired);
    await smt.addLeaf(
      stateId.data,
      (await calculateLeafValue(expiredCertificationData.transactionHash, REFERENCE_TIME)).data,
    );
    const root = await smt.calculateRoot();

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(
          expiredCertificationData,
          REFERENCE_TIME,
          InclusionCertificate.create(root, stateId.data),
          await createUnicityCertificate(root.hash, signingService),
        ),
        await expired.calculateTransactionHash(),
        expired.expiresAt,
        expired.lockScript,
        expired.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.REQUEST_EXPIRED);
  });

  it('verification fails with invalid trustbase', async () => {
    const inclusionProof = new InclusionProof(
      certificationData,
      REFERENCE_TIME,
      inclusionCertificate,
      unicityCertificate,
    );

    await expect(
      InclusionProofVerificationRule.verify(
        createRootTrustBase(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
        predicateVerifier,
        unicityCertificateVerifier,
        inclusionProof,
        await transaction.calculateTransactionHash(),
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INVALID_TRUSTBASE);
  });
});

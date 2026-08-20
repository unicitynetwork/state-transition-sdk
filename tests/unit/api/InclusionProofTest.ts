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
import { requestTimeout } from '../../utils/RequestTimeout.js';
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

describe('InclusionProof', () => {
  const REFERENCE_TIME = 1755000000n;
  const signingService = new SigningService(
    new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
  );

  let predicateVerifier: PredicateVerifierService;
  let unicityCertificateVerifier: UnicityCertificateVerifier;
  let transaction: MintTransaction;
  let certificationData: CertificationData;
  let inclusionCertificate: InclusionCertificate;
  let unicityCertificate: UnicityCertificate;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    transaction = await MintTransaction.create(
      NetworkId.LOCAL,
      SignaturePredicate.fromSigningService(signingService),
      requestTimeout(),
    );
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await StateId.fromTransaction(transaction);
    certificationData = await CertificationData.fromMintTransaction(transaction);

    await smt.addLeaf(stateId.data, (await calculateLeafValue(certificationData.transactionHash, REFERENCE_TIME)).data);

    const root = await smt.calculateRoot();

    inclusionCertificate = InclusionCertificate.create(root, stateId.data);

    unicityCertificate = await createUnicityCertificate(root.hash, signingService);
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

  it('verifies', async () => {
    const transactionHash = await transaction.calculateTransactionHash();
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(certificationData, REFERENCE_TIME, inclusionCertificate, unicityCertificate),
        transactionHash,
        transaction.timeout,
        REFERENCE_TIME,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.OK);

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        new InclusionProof(certificationData, REFERENCE_TIME, null, unicityCertificate),
        transactionHash,
        transaction.timeout,
        REFERENCE_TIME,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING);
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
            CborSerializer.encodeUnsignedInteger(certificationData.timeout!),
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
        transaction.timeout,
        REFERENCE_TIME,
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
            CborSerializer.encodeUnsignedInteger(certificationData.timeout!),
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
        transaction.timeout,
        REFERENCE_TIME,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  it('verification fails when the reference time does not match the certified leaf', async () => {
    const inclusionProof = new InclusionProof(
      certificationData,
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
        transaction.timeout,
        REFERENCE_TIME + 1n,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.MISSING_REFERENCE_TIME);
  });

  it('verification fails when the reference time has reached the request timeout', async () => {
    const inclusionProof = new InclusionProof(
      certificationData,
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
        transaction.timeout,
        transaction.timeout!,
        transaction.lockScript,
        transaction.sourceStateHash,
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
        transaction.timeout,
        REFERENCE_TIME,
        transaction.lockScript,
        transaction.sourceStateHash,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INVALID_TRUSTBASE);
  });
});

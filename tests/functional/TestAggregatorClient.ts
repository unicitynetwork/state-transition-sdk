import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionCertificate } from '../../src/api/InclusionCertificate.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { calculateLeafValue } from '../../src/api/LeafValue.js';
import { StateId } from '../../src/api/StateId.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { SparseMerkleTree } from '../../src/smt/radix/SparseMerkleTree.js';
import { BitString } from '../../src/util/BitString.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

/**
 * Test aggregator client implementation that stores all submitted certification requests in memory.
 */
export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly predicateVerifier: PredicateVerifierService;
  /**
   * Reference time of the current round. Every accepted request is its own
   * round here, so a proof served later is anchored to a certificate whose
   * input record time is past the one the leaf was built from, exactly as it
   * is against a live aggregator.
   */
  private referenceTime: bigint = BigInt(Math.floor(Date.now() / 1000));
  private readonly requests: Map<bigint, { certificationData: CertificationData; referenceTime: bigint }> = new Map();

  private constructor(
    private readonly smt: SparseMerkleTree,
    private readonly signingService: SigningService,
  ) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
    this.predicateVerifier = PredicateVerifierService.create();
  }

  /**
   * Creates a new TestAggregatorClient instance with optional private key.
   * If no private key is provided, a new one is generated.
   */
  public static create(privateKey: Uint8Array = SigningService.generatePrivateKey()): TestAggregatorClient {
    return new TestAggregatorClient(
      new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)),
      new SigningService(privateKey),
    );
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const path = BitString.fromBytesBigEndian(stateId.data).toBigInt();
    const root = await this.smt.calculateRoot();

    const unicityCertificate = await createUnicityCertificate(root.hash, this.signingService, this.referenceTime);
    const record = this.requests.get(path);

    if (!record) {
      return Promise.resolve(new InclusionProofResponse(1n, new InclusionProof(null, null, null, unicityCertificate)));
    }

    return Promise.resolve(
      new InclusionProofResponse(
        1n,
        new InclusionProof(
          record.certificationData,
          record.referenceTime,
          InclusionCertificate.create(root, stateId.data),
          unicityCertificate,
        ),
      ),
    );
  }

  /**
   * @inheritDoc
   */
  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const stateId = await StateId.fromCertificationData(certificationData);

    const result = await this.predicateVerifier.verify(
      certificationData.lockScript,
      this.referenceTime,
      certificationData.sourceStateHash,
      certificationData.transactionHash,
      certificationData.unlockScript,
    );

    if (result.status !== VerificationStatus.OK) {
      return CertificationResponse.create(CertificationStatus.SIGNATURE_VERIFICATION_FAILED);
    }

    if (certificationData.timeout != null && this.referenceTime >= certificationData.timeout) {
      return CertificationResponse.create(CertificationStatus.REQUEST_EXPIRED);
    }

    const path = BitString.fromBytesBigEndian(stateId.data).toBigInt();
    if (!this.requests.has(path)) {
      const referenceTime = this.referenceTime;
      const leafValue = await calculateLeafValue(certificationData.transactionHash, referenceTime);
      await this.smt.addLeaf(stateId.data, leafValue.data);
      this.requests.set(path, { certificationData, referenceTime });
      this.referenceTime += 1n;
    }

    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }
}

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
  /**
   * Lifetime the service grants a request that omits its own deadline, matching
   * the aggregator's one-hour DEFAULT_REQUEST_TTL fallback.
   */
  private requestTtl: bigint = 3600n;
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
      return Promise.resolve(new InclusionProofResponse(1n, null, unicityCertificate));
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
        unicityCertificate,
      ),
    );
  }

  /**
   * Drive the round clock the fake certifies under.
   *
   * Zero is how the service reports that it has no consensus reference time
   * yet: it certifies nothing until consensus hands it one.
   *
   * @param {bigint} referenceTime Reference time a round starting now would pin.
   */
  public setReferenceTime(referenceTime: bigint): void {
    this.referenceTime = referenceTime;
  }

  /**
   * Shorten the lifetime granted to a request that carries no deadline of its
   * own, so a test can watch a service-assigned deadline lapse.
   *
   * @param {bigint} requestTtl Lifetime in seconds.
   */
  public setRequestTtl(requestTtl: bigint): void {
    this.requestTtl = requestTtl;
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

    // Nothing can be certified before consensus has handed the service a
    // reference time to pin rounds to.
    if (this.referenceTime === 0n) {
      return CertificationResponse.create(CertificationStatus.SERVICE_NOT_READY);
    }

    // An explicit deadline is used verbatim and is covered by the witness. A
    // request without one is admitted under a deadline the service derives from
    // consensus time; that value is service metadata, never recorded in the
    // leaf and never re-checked by a later verifier. Either way the deadline is
    // exclusive.
    const effectiveTimeout = certificationData.expiresAt ?? this.referenceTime + this.requestTtl;
    if (this.referenceTime >= effectiveTimeout) {
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

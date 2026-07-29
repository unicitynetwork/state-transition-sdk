import { InvalidJsonStructureError } from '../../serialization/json/InvalidJsonStructureError.js';
import { JsonError } from '../../serialization/json/JsonError.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { NetworkId } from '../NetworkId.js';

/**
 * JSON representation of a root trust base node information.
 */
interface INodeInfoJson {
  /**
   * Node id.
   */
  readonly nodeId: string;
  /**
   * Signing key.
   */
  readonly sigKey: string;
  /**
   * Staked amount.
   */
  readonly stake: string;
}

/**
 * Root trust base node information.
 */
export class RootTrustBaseNodeInfo {
  /**
   * RootTrustBaseNodeInfo constructor.
   * @param nodeId node id.
   * @param _signingKey signing key.
   * @param stakedAmount staked amount.
   */
  private constructor(
    public readonly nodeId: string,
    private readonly _signingKey: Uint8Array,
    public readonly stakedAmount: bigint,
  ) {
    this._signingKey = new Uint8Array(_signingKey);
  }

  /**
   * Get the signing key.
   */
  public get signingKey(): Uint8Array {
    return new Uint8Array(this._signingKey);
  }

  /**
   * Create a RootTrustBaseNodeInfo from JSON representation.
   * @param input JSON representation.
   * @return RootTrustBaseNodeInfo instance.
   */
  public static fromJSON(input: unknown): RootTrustBaseNodeInfo {
    if (!RootTrustBaseNodeInfo.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    const stake = BigInt(input.stake);
    if (stake <= 0n) {
      throw new JsonError('Each trust base root node must have positive stake.');
    }

    return new RootTrustBaseNodeInfo(input.nodeId, HexConverter.decode(input.sigKey), stake);
  }

  /**
   * Check whether the input is a JSON representation of RootTrustBaseNodeInfo.
   * @param input input to check.
   * @return true if the input is a JSON representation of RootTrustBaseNodeInfo.
   */
  public static isJSON(input: unknown): input is INodeInfoJson {
    return typeof input === 'object' && input !== null && 'nodeId' in input && 'sigKey' in input && 'stake' in input;
  }

  /**
   * @returns {INodeInfoJson} JSON representation of the node info.
   */
  public toJSON(): INodeInfoJson {
    return {
      nodeId: this.nodeId,
      sigKey: HexConverter.encode(this._signingKey),
      stake: this.stakedAmount.toString(),
    };
  }

  /**
   * @returns {string} String representation of the node info.
   */
  public toString(): string {
    return dedent`
    RootTrustBaseNodeInfo:
      NodeId: ${this.nodeId},
      SigningKey: ${HexConverter.encode(this._signingKey)},
      Stake: ${this.stakedAmount}`;
  }
}

/**
 * JSON shape of a {@link RootTrustBase}.
 */
interface IRootTrustBaseJson {
  readonly changeRecordHash: string | null;
  readonly epoch: string;
  readonly epochStartRound: string;
  readonly networkId: number;
  readonly previousEntryHash: string | null;
  readonly quorumThreshold: string;
  readonly rootNodes: INodeInfoJson[];
  readonly signatures: { [key: string]: string };
  readonly stateHash: string;
  readonly version: string;
}

/**
 * Root trust base information.
 */
export class RootTrustBase {
  private static readonly VERSION = 1n;

  private constructor(
    public readonly networkId: NetworkId,
    public readonly epoch: bigint,
    public readonly epochStartRound: bigint,
    public readonly _rootNodes: Map<string, RootTrustBaseNodeInfo>,
    public readonly quorumThreshold: bigint,
    public readonly _stateHash: Uint8Array,
    public readonly _changeRecordHash: Uint8Array | null,
    public readonly _previousEntryHash: Uint8Array | null,
    private readonly _signatures: Map<string, Uint8Array>,
  ) {
    this._rootNodes = new Map(_rootNodes);
    this._stateHash = new Uint8Array(_stateHash);
    this._changeRecordHash = _changeRecordHash ? new Uint8Array(_changeRecordHash) : null;
    this._previousEntryHash = _previousEntryHash ? new Uint8Array(_previousEntryHash) : null;
    this._signatures = new Map(
      Array.from(_signatures.entries()).map((_signature) => [_signature[0], new Uint8Array(_signature[1])]),
    );
  }

  /**
   * Get the change record hash.
   */
  public get changeRecordHash(): Uint8Array | null {
    return this._changeRecordHash ? new Uint8Array(this._changeRecordHash) : null;
  }

  /**
   * Get the previous entry hash.
   */
  public get previousEntryHash(): Uint8Array | null {
    return this._previousEntryHash ? new Uint8Array(this._previousEntryHash) : null;
  }

  /**
   * Get the root nodes.
   */
  public get rootNodes(): Map<string, RootTrustBaseNodeInfo> {
    return new Map(this._rootNodes);
  }

  /**
   * Get the signatures.
   */
  public get signatures(): Map<string, Uint8Array> {
    return new Map(
      Array.from(this._signatures.entries()).map((_signature) => [_signature[0], new Uint8Array(_signature[1])]),
    );
  }

  /**
   * Get the state hash.
   */
  public get stateHash(): Uint8Array {
    return new Uint8Array(this._stateHash);
  }

  /**
   * @returns {bigint} Wire-format version of the trust base.
   */
  public get version(): bigint {
    return RootTrustBase.VERSION;
  }

  /**
   * Create a root trust base from JSON string.
   *
   * @param input JSON string
   * @return root trust base
   */
  public static fromJSON(input: unknown): RootTrustBase {
    if (!RootTrustBase.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    const version = BigInt(input.version);
    if (version !== RootTrustBase.VERSION) {
      throw new JsonError(`Unsupported RootTrustBase version: ${version}`);
    }

    const rootNodes = new Map<string, RootTrustBaseNodeInfo>();
    const signingKeys = new Set<string>();
    for (const node of input.rootNodes) {
      const info = RootTrustBaseNodeInfo.fromJSON(node);
      if (rootNodes.has(info.nodeId)) {
        throw new JsonError(`Duplicate trust base node id: ${info.nodeId}`);
      }

      const signingKey = HexConverter.encode(info.signingKey);
      if (signingKeys.has(signingKey)) {
        throw new JsonError('Duplicate trust base signing key.');
      }
      signingKeys.add(signingKey);
      rootNodes.set(info.nodeId, info);
    }

    if (rootNodes.size === 0) {
      throw new JsonError('Trust base must contain at least one root node.');
    }

    const quorumThreshold = BigInt(input.quorumThreshold);
    if (quorumThreshold <= 0n || quorumThreshold > BigInt(rootNodes.size)) {
      throw new JsonError('Trust base quorum threshold must be between 1 and the root node count.');
    }

    return new RootTrustBase(
      NetworkId.fromId(input.networkId),
      BigInt(input.epoch),
      BigInt(input.epochStartRound),
      rootNodes,
      quorumThreshold,
      HexConverter.decode(input.stateHash),
      input.changeRecordHash ? HexConverter.decode(input.changeRecordHash) : null,
      input.previousEntryHash ? HexConverter.decode(input.previousEntryHash) : null,
      new Map(Object.entries(input.signatures).map(([id, signature]) => [id, HexConverter.decode(signature)])),
    );
  }

  /**
   * Check whether the input is a JSON representation of RootTrustBase.
   * @param input input to check.
   * @return true if the input is a JSON representation of RootTrustBase.
   */
  public static isJSON(input: unknown): input is IRootTrustBaseJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'version' in input &&
      'networkId' in input &&
      'epoch' in input &&
      'epochStartRound' in input &&
      'rootNodes' in input &&
      Array.isArray(input.rootNodes) &&
      'quorumThreshold' in input &&
      'stateHash' in input &&
      'changeRecordHash' in input &&
      'previousEntryHash' in input &&
      'signatures' in input &&
      typeof input.signatures == 'object' &&
      input.signatures !== null
    );
  }

  /**
   * @returns {IRootTrustBaseJson} JSON representation of the trust base (mirrors {@link fromJSON}).
   */
  public toJSON(): IRootTrustBaseJson {
    return {
      changeRecordHash: this._changeRecordHash ? HexConverter.encode(this._changeRecordHash) : null,
      epoch: this.epoch.toString(),
      epochStartRound: this.epochStartRound.toString(),
      networkId: this.networkId.id,
      previousEntryHash: this._previousEntryHash ? HexConverter.encode(this._previousEntryHash) : null,
      quorumThreshold: this.quorumThreshold.toString(),
      rootNodes: Array.from(this._rootNodes.values()).map((node) => node.toJSON()),
      signatures: Object.fromEntries(
        Array.from(this._signatures.entries()).map(([id, signature]) => [id, HexConverter.encode(signature)]),
      ),
      stateHash: HexConverter.encode(this._stateHash),
      version: this.version.toString(),
    };
  }

  /**
   * @returns {string} String representation of the trust base.
   */
  public toString(): string {
    return dedent`
    RootTrustBase:
      Version: ${this.version},
      NetworkId: ${this.networkId.toString()},
      Epoch: ${this.epoch},
      EpochStartRound: ${this.epochStartRound},
      RootNodes: [${Array.from(this._rootNodes.values())
        .map((node) => node.toString())
        .join(', ')}],
      QuorumThreshold: ${this.quorumThreshold},
      StateHash: ${HexConverter.encode(this._stateHash)},
      ChangeRecordHash: ${this._changeRecordHash ? HexConverter.encode(this._changeRecordHash) : 'null'},
      PreviousEntryHash: ${this._previousEntryHash ? HexConverter.encode(this._previousEntryHash) : 'null'},
      Signatures: [
        ${Array.from(this._signatures.entries())
          .map(([id, sig]) => `${id}: ${HexConverter.encode(sig)}`)
          .join(', ')}
      ]`;
  }
}

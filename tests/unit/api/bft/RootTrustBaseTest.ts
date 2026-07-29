import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { JsonError } from '../../../../src/serialization/json/JsonError.js';

function trustBaseJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    changeRecordHash: null,
    epoch: '0',
    epochStartRound: '0',
    networkId: NetworkId.LOCAL.id,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: 'NODE', sigKey: '02aa', stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '1',
    ...overrides,
  };
}

describe('RootTrustBase', () => {
  it('should parse a valid trust base', () => {
    const trustBase = RootTrustBase.fromJSON(trustBaseJson());

    expect(trustBase.version).toBe(1n);
    expect(trustBase.quorumThreshold).toBe(1n);
    expect(trustBase.rootNodes.size).toBe(1);
  });

  it('should round-trip through toJSON', () => {
    const json = trustBaseJson({
      changeRecordHash: 'aabb',
      previousEntryHash: 'ccdd',
      signatures: { NODE: '1122' },
      stateHash: '00ff',
    });

    const roundTripped = RootTrustBase.fromJSON(json).toJSON();
    expect(roundTripped).toEqual(json);
    // toJSON output must itself be valid fromJSON input (this is how a worker rebuilds it).
    expect(RootTrustBase.fromJSON(roundTripped).toJSON()).toEqual(roundTripped);
  });

  it('should reject an unsupported version', () => {
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ version: '2' }))).toThrow(JsonError);
  });

  it('should reject an empty root node set', () => {
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ rootNodes: [] }))).toThrow(JsonError);
  });

  it('should reject a non-positive quorum threshold', () => {
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ quorumThreshold: '0' }))).toThrow(JsonError);
  });

  it('should reject a quorum threshold exceeding the root node count', () => {
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ quorumThreshold: '2' }))).toThrow(JsonError);
  });

  it('should reject a root node with non-positive stake', () => {
    const rootNodes = [{ nodeId: 'NODE', sigKey: '02aa', stake: '0' }];
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ rootNodes }))).toThrow(JsonError);
  });

  it('should reject duplicate node ids', () => {
    const rootNodes = [
      { nodeId: 'NODE', sigKey: '02aa', stake: '1' },
      { nodeId: 'NODE', sigKey: '02bb', stake: '1' },
    ];
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ rootNodes }))).toThrow(JsonError);
  });

  it('should reject duplicate signing keys', () => {
    const rootNodes = [
      { nodeId: 'NODE_A', sigKey: '02aa', stake: '1' },
      { nodeId: 'NODE_B', sigKey: '02aa', stake: '1' },
    ];
    expect(() => RootTrustBase.fromJSON(trustBaseJson({ rootNodes }))).toThrow(JsonError);
  });
});

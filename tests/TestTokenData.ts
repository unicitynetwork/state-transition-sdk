import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { ISerializable } from '../src/ISerializable.js';

export class TestTokenData implements ISerializable {
    public constructor(private readonly _data: Uint8Array) {
        this._data = new Uint8Array(_data);
    }

    public get data(): Uint8Array {
        return new Uint8Array(this._data);
    }

    public static fromJSON(data: unknown): Promise<TestTokenData> {
        if (typeof data !== 'string') {
            throw new Error('Invalid test token data');
        }

        return Promise.resolve(new TestTokenData(HexConverter.decode(data)));
    }

    public toJSON(): string {
        return HexConverter.encode(this._data);
    }

    public toCBOR(): Uint8Array {
        return this.data;
    }

    public toString(): string {
        return dedent`
      TestTokenData: ${HexConverter.encode(this.data)}`;
    }
}

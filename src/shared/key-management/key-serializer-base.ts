import { Key, KeySerializer, SerializedKey } from "./types";

export abstract class KeySerializerBase<K extends Key>
  implements KeySerializer<K>
{
  protected constructor(protected serializableFields: (keyof K)[]) {}

  serialize(keyObj: K): SerializedKey {
    return {
      ...Object.fromEntries(
        this.serializableFields
          .map((f) => [f, keyObj[f]])
          .filter(([, v]) => v !== undefined)
      ),
      key: keyObj.key,
    };
  }

  partialSerialize(key: string, update: Partial<K>): Partial<SerializedKey> {
    return {
      ...Object.fromEntries(
        this.serializableFields
          .map((f) => [f, update[f]])
          .filter(([, v]) => v !== undefined)
      ),
      key,
    };
  }

  abstract deserialize(serializedKey: SerializedKey): K;
}

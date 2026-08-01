import { describe, expect, test } from 'vitest';
import {
  AlgebraicType,
  BinaryReader,
  BinaryWriter,
  Identity,
  Option,
  ProductType,
} from '../src';

const RealFunction = globalThis.Function;

const CSP_MESSAGE =
  "Evaluating a string as JavaScript violates the following Content Security Policy directive: \"script-src 'self' 'wasm-unsafe-eval'\"";

/**
 * Runs `fn` with `globalThis.Function` replaced by a proxy that throws on any
 * call or construction, the way a browser under a `script-src` CSP without
 * `'unsafe-eval'` (or a Cloudflare Worker) rejects `Function(...)` / `eval(...)`.
 * Property reads such as `Function.prototype` still pass through, so unrelated
 * runtime machinery keeps working.
 */
function underStrictCsp<T>(fn: () => T): T {
  const blocked = new Proxy(RealFunction, {
    apply() {
      throw new EvalError(CSP_MESSAGE);
    },
    construct() {
      throw new EvalError(CSP_MESSAGE);
    },
  });
  globalThis.Function = blocked as FunctionConstructor;
  try {
    return fn();
  } finally {
    globalThis.Function = RealFunction;
  }
}

describe('serde works without dynamic code evaluation (strict CSP)', () => {
  test('the lockdown harness really does block Function/eval', () => {
    expect(() =>
      underStrictCsp(() => (globalThis.Function as any)('return 1'))
    ).toThrowError(EvalError);
    expect(() =>
      underStrictCsp(() => new (globalThis.Function as any)('return 1'))
    ).toThrowError(EvalError);
    expect(RealFunction('return 1')()).toEqual(1);
  });

  test('non-trivial product: primitives + nested product + option', () => {
    const ty = AlgebraicType.Product({
      elements: [
        { name: 'id', algebraicType: AlgebraicType.U32 },
        { name: 'flag', algebraicType: AlgebraicType.Bool },
        { name: 'name', algebraicType: AlgebraicType.String },
        {
          name: 'nested',
          algebraicType: AlgebraicType.Product({
            elements: [
              { name: 'x', algebraicType: AlgebraicType.I64 },
              { name: 'y', algebraicType: AlgebraicType.F64 },
            ],
          }),
        },
        {
          name: 'maybe',
          algebraicType: Option.getAlgebraicType(AlgebraicType.U16),
        },
      ],
    });

    const value = {
      id: 42,
      flag: true,
      name: 'paw',
      nested: { x: -7n, y: 0.5 },
      maybe: 513,
    };

    const expected = new Uint8Array([
      0x2a, 0x00, 0x00, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x70, 0x61, 0x77,
      0xf9, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xe0, 0x3f, 0x00, 0x01, 0x02,
    ]);

    const buffer = underStrictCsp(() => {
      const serialize = ProductType.makeSerializer(ty.value);
      const writer = new BinaryWriter(1024);
      serialize(writer, value);
      return writer.getBuffer();
    });
    expect(buffer).toEqual(expected);

    const roundTripped = underStrictCsp(() =>
      ProductType.makeDeserializer(ty.value)(new BinaryReader(buffer))
    );
    expect(roundTripped).toEqual(value);
  });

  test('absent option field serializes to the `none` tag alone', () => {
    const ty = AlgebraicType.Product({
      elements: [
        { name: 'id', algebraicType: AlgebraicType.U8 },
        {
          name: 'maybe',
          algebraicType: Option.getAlgebraicType(AlgebraicType.U16),
        },
      ],
    });

    const buffer = underStrictCsp(() => {
      const writer = new BinaryWriter(16);
      ProductType.makeSerializer(ty.value)(writer, {
        id: 9,
        maybe: undefined,
      });
      return writer.getBuffer();
    });
    expect(buffer).toEqual(new Uint8Array([0x09, 0x01]));

    const roundTripped = underStrictCsp(() =>
      ProductType.makeDeserializer(ty.value)(new BinaryReader(buffer))
    );
    expect(roundTripped).toEqual({ id: 9, maybe: undefined });
  });

  test('all-fixed-size product (previously the codegen fast path)', () => {
    const ty = AlgebraicType.Product({
      elements: [
        { name: 'a', algebraicType: AlgebraicType.U32 },
        { name: 'b', algebraicType: AlgebraicType.Bool },
        { name: 'c', algebraicType: AlgebraicType.I64 },
        { name: 'd', algebraicType: AlgebraicType.F64 },
      ],
    });
    const value = { a: 42, b: true, c: -7n, d: 0.5 };

    const buffer = underStrictCsp(() => {
      const writer = new BinaryWriter(64);
      ProductType.makeSerializer(ty.value)(writer, value);
      return writer.getBuffer();
    });
    expect(buffer).toEqual(
      new Uint8Array([
        0x2a, 0x00, 0x00, 0x00, 0x01, 0xf9, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x3f,
      ])
    );

    const roundTripped = underStrictCsp(() =>
      ProductType.makeDeserializer(ty.value)(new BinaryReader(buffer))
    );
    expect(roundTripped).toEqual(value);
  });

  test('single-field wrapper class (Identity)', () => {
    const ty = Identity.getAlgebraicType();
    const identity = new Identity(0xdeadbeefn);

    const buffer = underStrictCsp(() => {
      const writer = new BinaryWriter(64);
      ProductType.makeSerializer(ty.value)(writer, identity);
      return writer.getBuffer();
    });
    expect(buffer.length).toEqual(32);

    const roundTripped = underStrictCsp(() =>
      ProductType.makeDeserializer(ty.value)(new BinaryReader(buffer))
    );
    expect(roundTripped).toBeInstanceOf(Identity);
    expect((roundTripped as Identity).__identity__).toEqual(0xdeadbeefn);
  });

  test('sum type dispatch and recursive types via a typespace', () => {
    const listType = AlgebraicType.Product({
      elements: [
        { name: 'value', algebraicType: AlgebraicType.U8 },
        {
          name: 'next',
          algebraicType: Option.getAlgebraicType(AlgebraicType.Ref(0)),
        },
      ],
    });
    const typespace = { types: [listType] };
    const value = { value: 1, next: { value: 2, next: undefined } };

    const buffer = underStrictCsp(() => {
      const writer = new BinaryWriter(64);
      ProductType.makeSerializer(listType.value, typespace)(writer, value);
      return writer.getBuffer();
    });
    expect(buffer).toEqual(new Uint8Array([0x01, 0x00, 0x02, 0x01]));

    const roundTripped = underStrictCsp(() =>
      ProductType.makeDeserializer(
        listType.value,
        typespace
      )(new BinaryReader(buffer))
    );
    expect(roundTripped).toEqual(value);
  });

  test('tagged sum type', () => {
    const ty = AlgebraicType.Sum({
      variants: [
        { name: 'bar', algebraicType: AlgebraicType.U32 },
        { name: 'foo', algebraicType: AlgebraicType.String },
      ],
    });

    const buffer = underStrictCsp(() => {
      const writer = new BinaryWriter(64);
      AlgebraicType.makeSerializer(ty)(writer, { tag: 'foo', value: 'hi' });
      return writer.getBuffer();
    });
    expect(buffer).toEqual(
      new Uint8Array([0x01, 0x02, 0x00, 0x00, 0x00, 0x68, 0x69])
    );

    const roundTripped = underStrictCsp(() =>
      AlgebraicType.makeDeserializer(ty)(new BinaryReader(buffer))
    );
    expect(roundTripped).toEqual({ tag: 'foo', value: 'hi' });

    expect(() =>
      underStrictCsp(() =>
        AlgebraicType.makeSerializer(ty)(new BinaryWriter(8), {
          tag: 'nope',
          value: 1,
        })
      )
    ).toThrowError(TypeError);
  });
});

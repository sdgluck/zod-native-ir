import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { collect, fromJsonSchema, SchemaError } from "./index.ts";

const convert = (schema: z.ZodType, io: "input" | "output" = "output") =>
  fromJsonSchema(z.toJSONSchema(schema, { io, reused: "ref" }) as Record<string, unknown>, "fixture").t;

describe("fromJsonSchema", () => {
  test("an int64-annotated number is an int, a plain one a double, .int() an int", () => {
    assert.deepEqual(convert(z.number().meta({ format: "int64" })), { k: "int" });
    assert.deepEqual(convert(z.number()), { k: "double" });
    assert.deepEqual(convert(z.number().int()), { k: "int" });
  });

  test("optional and nullable stay distinct", () => {
    const t = convert(z.object({ a: z.string().optional(), b: z.string().nullable() }));
    assert.deepEqual(t, {
      k: "object",
      props: [
        { key: "a", optional: true, t: { k: "string" } },
        { key: "b", optional: false, t: { k: "nullable", of: { k: "string" } } },
      ],
    });
  });

  test("a defaulted field is optional as input and required as output", () => {
    const schema = z.object({ n: z.number().default(3) });
    assert.equal((convert(schema, "input") as { props: Array<{ optional: boolean }> }).props[0].optional, true);
    assert.equal((convert(schema, "output") as { props: Array<{ optional: boolean }> }).props[0].optional, false);
  });

  test("an unknown-typed key is optional, because undefined drops out of JSON", () => {
    const t = convert(z.object({ meta: z.unknown() })) as { props: Array<{ optional: boolean }> };
    assert.equal(t.props[0].optional, true);
  });

  test("literal unions collapse to an enum, a number or a boolean", () => {
    assert.deepEqual(convert(z.union([z.literal("a"), z.literal("b")])), { k: "enum", values: ["a", "b"] });
    assert.deepEqual(convert(z.union([z.literal(0), z.literal(7)])), { k: "int" });
  });

  test("a discriminated union records its tag per variant", () => {
    const t = convert(
      z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), why: z.string() })]),
    );
    assert.equal(t.k, "union");
    assert.deepEqual(
      (t as { variants: Array<{ tag: unknown }> }).variants.map((v) => v.tag),
      [true, false],
    );
  });

  test("a union nothing tells apart is refused rather than guessed", () => {
    assert.throws(() => convert(z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])), SchemaError);
  });

  test("a union of unlike scalars is refused", () => {
    assert.throws(() => convert(z.union([z.string(), z.number()])), SchemaError);
  });
});

describe("collect", () => {
  const Shared = z.object({ id: z.string() }).meta({ id: "SharedFixture" });

  test("a named shape reached from two roots is one definition", () => {
    const doc = collect([
      { name: "A", schema: z.object({ x: Shared }) },
      { name: "B", schema: z.array(Shared) },
    ]);
    assert.deepEqual(
      doc.defs.map((d) => d.name),
      ["SharedFixture"],
    );
    assert.deepEqual(doc.roots[1].t, { k: "array", of: { k: "ref", name: "SharedFixture" } });
  });

  test("zod's anonymous reuse is inlined, not turned into a definition", () => {
    const s = z.string();
    const doc = collect([{ name: "A", schema: z.object({ a: s, b: s }) }]);
    assert.deepEqual(doc.defs, []);
  });

  test("the same name twice in a namespace is an error", () => {
    assert.throws(
      () =>
        collect([
          { namespace: "N", name: "A", schema: z.string() },
          { namespace: "N", name: "A", schema: z.number() },
        ]),
      SchemaError,
    );
  });

  test("a named shape that differs between input and output is an error naming both", () => {
    const Defaulted = z.object({ n: z.number().default(1) }).meta({ id: "DefaultedFixture" });
    assert.throws(
      () =>
        collect([
          { name: "In", schema: z.object({ d: Defaulted }), io: "input" },
          { name: "Out", schema: z.object({ d: Defaulted }), io: "output" },
        ]),
      /DefaultedFixture is defined differently by In and Out/,
    );
  });
});

# zod-native-ir

The shared front half of [`zod-to-swift`](https://github.com/sdgluck/zod-to-swift)
and [`zod-to-kotlin`](https://github.com/sdgluck/zod-to-kotlin): [zod](https://zod.dev) 4
schemas → JSON Schema → a small, language-neutral type IR that an emitter for a
native language can walk.

You only need this directly to write an emitter for another language, or to
inspect what the two emitters will see.

```ts
import { z } from "zod";
import { collect } from "zod-native-ir";

const doc = collect([
  { name: "Status", schema: z.enum(["on", "off"]) },
  { name: "Room", namespace: "Match", schema: z.object({ code: z.string(), members: z.array(z.string()) }) },
]);
// doc.roots: [{ name: "Status", t: { k: "enum", values: ["on", "off"] } }, { namespace: "Match", name: "Room", t: { k: "object", props: [...] } }]
// doc.defs:  every `.meta({ id })` shape the roots reach, once, sorted by name
```

## The IR

```ts
type IRType =
  | { k: "string" } | { k: "int" } | { k: "double" } | { k: "bool" }
  | { k: "json" }                                   // z.unknown() / z.any()
  | { k: "literal"; value: string | number | boolean }
  | { k: "enum"; values: string[] }
  | { k: "array"; of: IRType }
  | { k: "record"; of: IRType }
  | { k: "object"; props: { key: string; optional: boolean; t: IRType }[] }
  | { k: "union"; discriminator: string; variants: { tag: string | number | boolean; t: IRType }[] }
  | { k: "nullable"; of: IRType }
  | { k: "ref"; name: string };                     // a `.meta({ id })` shape in `defs`
```

Decisions made here so every emitter agrees:

- **Optional and nullable stay distinct.** `optional` means the key may be
  absent; `nullable` means it may be `null`. They encode differently on the wire.
- **`io` decides defaults.** As `"input"`, a field with `.default()` is optional
  (a sender may omit it); as `"output"` (the default) it is required.
- **A `z.unknown()` key is always optional**, because `undefined` is one of its
  values and JSON drops it.
- **Integers** are `z.number().int()`, or `z.number().meta({ format: "int64" })`
  when you want the native type to be an integer without zod validating it.
- **Unions must be discriminated.** A union of objects with a shared required
  literal property becomes `union`; a union of string literals becomes `enum`;
  of number or boolean literals, the base type. Anything else throws
  `SchemaError` rather than producing a type that decodes the wrong thing.
- **Named shapes merge.** A `.meta({ id })` shape reached from several roots is
  one definition; the same id meaning two shapes (often one schema read as both
  input and output, with a default) throws, naming both.

Naming helpers shared by the emitters are exported too: `pascal`, `camel`,
`nestedName` (`members` in an array → `Member`), `variantCaseName`.

## License

MIT

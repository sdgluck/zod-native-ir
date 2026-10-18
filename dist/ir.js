/**
 * JSON Schema → a small type IR that `zod-to-swift` and `zod-to-kotlin` share.
 *
 * zod's `toJSONSchema` is the source rather than zod's own internals, because
 * the JSON Schema is the stable, documented shape — zod's `_def` changed
 * wholesale between 3 and 4 — and because it already resolves defaults,
 * optionality and `io: "input"` vs `"output"` the way the wire sees them.
 *
 * Only shapes with a faithful native spelling are modelled. Anything else is a
 * thrown `SchemaError` naming where it was found, not a best guess: a model
 * that guessed is a decode failure on somebody's phone, found much later.
 */
/** zod names a def it hoisted for reuse without an id `__schemaN`; those are inlined. */
const isAnonymousDef = (name) => name.startsWith("__schema");
export class SchemaError extends Error {
}
export function fromJsonSchema(root, where) {
    const rawDefs = root.$defs ?? {};
    const defs = new Map();
    function resolve(ref) {
        const m = /^#\/\$defs\/(.+)$/.exec(ref);
        if (!m || !rawDefs[m[1]])
            throw new SchemaError(`${where}: unresolvable $ref ${ref}`);
        return { name: m[1], schema: rawDefs[m[1]] };
    }
    function convert(s, at) {
        if (s.$ref) {
            const { name, schema } = resolve(s.$ref);
            if (isAnonymousDef(name))
                return convert(schema, at);
            if (!defs.has(name)) {
                // Placeholder first, so a self-reference terminates.
                defs.set(name, { k: "json" });
                defs.set(name, convert(schema, name));
            }
            return { k: "ref", name };
        }
        const alts = s.anyOf ?? s.oneOf;
        if (alts) {
            const nonNull = alts.filter((a) => a.type !== "null");
            if (nonNull.length < alts.length) {
                const inner = nonNull.length === 1 ? convert(nonNull[0], at) : convert({ ...s, anyOf: nonNull, oneOf: undefined }, at);
                return inner.k === "nullable" ? inner : { k: "nullable", of: inner };
            }
            return union(nonNull, at);
        }
        if (s.const !== undefined) {
            if (typeof s.const === "string" || typeof s.const === "number" || typeof s.const === "boolean") {
                return { k: "literal", value: s.const };
            }
            throw new SchemaError(`${where} ${at}: unsupported const ${JSON.stringify(s.const)}`);
        }
        if (s.enum) {
            if (!s.enum.every((v) => typeof v === "string")) {
                throw new SchemaError(`${where} ${at}: only string enums are supported`);
            }
            return { k: "enum", values: s.enum };
        }
        const type = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
        if (type.includes("null") && type.length > 1) {
            return { k: "nullable", of: convert({ ...s, type: type.filter((x) => x !== "null") }, at) };
        }
        // Newer zod writes `z.union([z.string(), z.number()])` as one schema with
        // `type: ["string", "number"]`. Taking the first would generate a model
        // that fails to decode half the values it was promised.
        if (type.length > 1)
            throw new SchemaError(`${where} ${at}: a union of ${type.join(" | ")} has no native spelling`);
        switch (type[0]) {
            case "string":
                return { k: "string" };
            case "integer":
                return { k: "int" };
            case "number":
                return s.format === "int64" || s.format === "safeint" ? { k: "int" } : { k: "double" };
            case "boolean":
                return { k: "bool" };
            case "null":
                throw new SchemaError(`${where} ${at}: a bare null type`);
            case "array":
                if (!s.items)
                    throw new SchemaError(`${where} ${at}: array without items (a tuple?)`);
                return { k: "array", of: convert(s.items, `${at}[]`) };
            case "object": {
                const props = s.properties ?? {};
                const keys = Object.keys(props);
                if (keys.length === 0 && s.additionalProperties && typeof s.additionalProperties === "object") {
                    return { k: "record", of: convert(s.additionalProperties, `${at}{}`) };
                }
                if (keys.length === 0 && s.additionalProperties !== false)
                    return { k: "record", of: { k: "json" } };
                const required = new Set(s.required ?? []);
                return {
                    k: "object",
                    props: keys.map((key) => {
                        const t = convert(props[key], `${at}.${key}`);
                        // zod lists a `z.unknown()` key as required, but `undefined` is one
                        // of its values and JSON drops it — so the key can be missing.
                        return { key, optional: !required.has(key) || t.k === "json", t };
                    }),
                };
            }
            case undefined:
                // `z.unknown()` / `z.any()`: an empty schema.
                return { k: "json" };
            default:
                throw new SchemaError(`${where} ${at}: unsupported type ${String(type[0])}`);
        }
    }
    function union(alts, at) {
        if (alts.length === 1)
            return convert(alts[0], at);
        // Literal-only unions are an enum spelt the long way.
        if (alts.every((a) => typeof a.const === "string"))
            return { k: "enum", values: alts.map((a) => a.const) };
        // `0 | 7 | 30 | 90` — the client offers what the server lists elsewhere; the
        // model only needs to carry the number.
        if (alts.every((a) => typeof a.const === "number")) {
            return alts.every((a) => Number.isInteger(a.const)) ? { k: "int" } : { k: "double" };
        }
        if (alts.every((a) => typeof a.const === "boolean"))
            return { k: "bool" };
        const objects = alts.map((a) => {
            const target = a.$ref ? resolve(a.$ref).schema : a;
            if (target.type !== "object")
                throw new SchemaError(`${where} ${at}: a union of non-objects`);
            return target;
        });
        const literalOf = (o, key) => {
            let p = o.properties?.[key];
            if (p?.$ref)
                p = resolve(p.$ref).schema;
            return p?.const;
        };
        const discriminator = Object.keys(objects[0].properties ?? {}).find((key) => objects.every((o) => literalOf(o, key) !== undefined && (o.required ?? []).includes(key)));
        if (!discriminator)
            throw new SchemaError(`${where} ${at}: a union with no discriminating literal property`);
        const tags = objects.map((o) => literalOf(o, discriminator));
        if (new Set(tags).size !== tags.length)
            throw new SchemaError(`${where} ${at}: duplicate discriminator values`);
        return {
            k: "union",
            discriminator,
            variants: alts.map((a, i) => ({ tag: tags[i], t: convert(a, `${at}|${String(tags[i])}`) })),
        };
    }
    const t = convert(root, "");
    return { t, defs };
}
// ─── Naming ────────────────────────────────────────────────────────────────
export function pascal(s) {
    return s
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join("");
}
export function camel(s) {
    const p = pascal(s);
    if (!p)
        return "value";
    const c = p[0].toLowerCase() + p.slice(1);
    return /^[0-9]/.test(c) ? `v${c}` : c;
}
/** The nested type a property's inline shape becomes: `members` → `Member`. */
export function nestedName(key, isArray) {
    const p = pascal(key) || "Value";
    if (!isArray)
        return p;
    if (p.endsWith("ies") && p.length > 4)
        return `${p.slice(0, -3)}y`;
    if (p.endsWith("s") && !p.endsWith("ss") && p.length > 3)
        return p.slice(0, -1);
    return `${p}Item`;
}
/**
 * The case name for one variant of a discriminated union. A boolean tag
 * (`ok: true | false`) gets `okTrue` / `okFalse` rather than `true` / `false`,
 * which are keywords in both target languages.
 */
export function variantCaseName(discriminator, tag) {
    if (typeof tag === "boolean")
        return `${camel(discriminator)}${tag ? "True" : "False"}`;
    return camel(String(tag));
}
//# sourceMappingURL=ir.js.map
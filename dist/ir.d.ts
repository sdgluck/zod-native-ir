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
export type IRType = {
    k: "string";
} | {
    k: "int";
} | {
    k: "double";
} | {
    k: "bool";
}
/** Anything at all — a config blob, event metadata. `JSONValue` / `JsonElement`. */
 | {
    k: "json";
}
/** A single-value literal outside a union (`ok: true`); emitted as its base type. */
 | {
    k: "literal";
    value: string | number | boolean;
} | {
    k: "enum";
    values: string[];
} | {
    k: "array";
    of: IRType;
} | {
    k: "record";
    of: IRType;
} | {
    k: "object";
    props: IRProp[];
}
/** A union of objects told apart by one literal property. */
 | {
    k: "union";
    discriminator: string;
    variants: IRVariant[];
} | {
    k: "nullable";
    of: IRType;
}
/** A named shared shape (`.meta({ id })`), declared once at the top level. */
 | {
    k: "ref";
    name: string;
};
export interface IRProp {
    key: string;
    /** Absent from the JSON is allowed (as opposed to present-and-null). */
    optional: boolean;
    t: IRType;
}
export interface IRVariant {
    /** The discriminator's value for this variant. */
    tag: string | number | boolean;
    t: IRType;
}
type JsonSchema = Record<string, unknown> & {
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    type?: string | string[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    additionalProperties?: boolean | JsonSchema;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    enum?: unknown[];
    const?: unknown;
    format?: string;
};
export declare class SchemaError extends Error {
}
export interface Converted {
    t: IRType;
    /** Named defs this schema referenced, converted. */
    defs: Map<string, IRType>;
}
export declare function fromJsonSchema(root: JsonSchema, where: string): Converted;
export declare function pascal(s: string): string;
export declare function camel(s: string): string;
/**
 * The nested type a property's inline shape becomes: `members` → `Member`.
 *
 * Only the regular plurals are singularised. A word that merely ends in `s`
 * (`previous`, `status`, `analysis`) gets `Item` rather than a truncation:
 * `PreviousItem` reads oddly, `Previou` reads as a bug.
 */
export declare function nestedName(key: string, isArray: boolean): string;
/**
 * The case name for one variant of a discriminated union. A boolean tag
 * (`ok: true | false`) gets `okTrue` / `okFalse` rather than `true` / `false`,
 * which are keywords in both target languages.
 */
export declare function variantCaseName(discriminator: string, tag: string | number | boolean): string;
/** One type the caller asked for by name, converted. */
export interface IRRoot {
    /** Grouping for emitters that nest (`enum Portal {}` / `object Portal`); absent = top level. */
    namespace?: string;
    name: string;
    t: IRType;
}
export interface IRDocument {
    roots: IRRoot[];
    /** Shapes named with `.meta({ id })`, declared once at the top level, in a stable order. */
    defs: Array<{
        name: string;
        t: IRType;
    }>;
}
export {};

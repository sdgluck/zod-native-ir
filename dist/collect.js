/**
 * Named zod schemas → one IR document, with every `.meta({ id })` shape they
 * reach merged into a single set of top-level definitions.
 *
 * Merging is the point of this step. Two schemas that share a named shape must
 * produce one native type, not two identical ones the app can't pass between;
 * and the same id meaning two different shapes is an error, because one of
 * the two generated types would be wrong.
 */
import { z } from "zod";
import { fromJsonSchema, SchemaError } from "./ir.js";
export function collect(types) {
    const defs = new Map();
    const roots = [];
    const seen = new Set();
    for (const { name, schema, namespace, io = "output" } of types) {
        const where = namespace ? `${namespace}.${name}` : name;
        if (seen.has(where))
            throw new SchemaError(`${where} is declared twice`);
        seen.add(where);
        const json = z.toJSONSchema(schema, { io, reused: "ref", unrepresentable: "throw", target: "draft-2020-12" });
        const converted = fromJsonSchema(json, where);
        for (const [defName, t] of converted.defs) {
            const prior = defs.get(defName);
            if (!prior)
                defs.set(defName, { t, from: where });
            else if (JSON.stringify(prior.t) !== JSON.stringify(t)) {
                // Usually one shape read as input in one place and output in another,
                // where a default makes the two differ.
                throw new SchemaError(`${defName} is defined differently by ${prior.from} and ${where}`);
            }
        }
        roots.push({ namespace, name, t: converted.t });
    }
    return {
        roots,
        defs: [...defs].map(([name, { t }]) => ({ name, t })).sort((a, b) => a.name.localeCompare(b.name)),
    };
}
//# sourceMappingURL=collect.js.map
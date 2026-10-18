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
import { fromJsonSchema, SchemaError, type IRDocument, type IRRoot, type IRType } from "./ir.ts";

export interface NamedSchema {
  /** The type name to generate, e.g. `LeavingSoonOutput`. */
  name: string;
  schema: z.ZodType;
  /** Optional grouping, e.g. `Portal`. Names must be unique within a namespace. */
  namespace?: string;
  /**
   * Which side of the schema to describe. `input` makes a field with a default
   * optional (the sender may omit it); `output` makes it required (the parsed
   * value always has it). Defaults to `output`.
   */
  io?: "input" | "output";
}

export function collect(types: NamedSchema[]): IRDocument {
  const defs = new Map<string, { t: IRType; from: string }>();
  const roots: IRRoot[] = [];
  const seen = new Set<string>();

  for (const { name, schema, namespace, io = "output" } of types) {
    const where = namespace ? `${namespace}.${name}` : name;
    if (seen.has(where)) throw new SchemaError(`${where} is declared twice`);
    seen.add(where);

    const json = z.toJSONSchema(schema, { io, reused: "ref", unrepresentable: "throw", target: "draft-2020-12" });
    const converted = fromJsonSchema(json as Record<string, unknown>, where);
    for (const [defName, t] of converted.defs) {
      const prior = defs.get(defName);
      if (!prior) defs.set(defName, { t, from: where });
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

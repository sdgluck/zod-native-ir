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
import { type IRDocument } from "./ir.ts";
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
export declare function collect(types: NamedSchema[]): IRDocument;

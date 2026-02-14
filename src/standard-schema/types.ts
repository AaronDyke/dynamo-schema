/**
 * Inlined Standard Schema V1 types.
 * @see https://github.com/standard-schema/standard-schema
 *
 * Zero runtime dependency -- these are type-only declarations that allow
 * dynamo-schema to accept any compliant schema library (Zod, Valibot,
 * ArkType, etc.) without importing them.
 */

/** The Standard Schema interface. */
export type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
};

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = Success<Output> | Failure;

  /** The success interface of the validate function. */
  export interface Success<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  /** The failure interface of the validate function. */
  export interface Failure {
    readonly issues: ReadonlyArray<Issue>;
  }

  /** The issue interface of the validate function. */
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<
      PropertyKey | PathSegment
    > | undefined;
  }

  /** The path segment interface of the validate function. */
  export interface PathSegment {
    readonly key: PropertyKey;
  }

  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> =
    NonNullable<Schema["~standard"]["types"]>["input"];

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> =
    NonNullable<Schema["~standard"]["types"]>["output"];
}

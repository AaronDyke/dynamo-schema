/**
 * Filter/condition expression builder: creates type-safe DynamoDB filter
 * expressions for use in query/scan filters and put/delete/update conditions.
 *
 * Handles reserved word aliasing, value placeholder injection, and
 * AND/OR/NOT composition automatically — making it impossible to write a
 * malformed expression.
 */

import type {
  FilterBuilder,
  FilterBuilderFn,
  FilterNode,
  CompiledFilter,
  FilterInput,
  DynamoAttributeType,
} from "../types/filter-expression.js";

/**
 * Creates a type-safe filter/condition expression builder.
 *
 * The builder is a stateless factory — each method returns a frozen
 * `FilterNode` that can be composed with `and`, `or`, and `not`.
 * Pass the resulting node to `compileFilterNode()` to get the
 * DynamoDB expression string and attribute maps.
 *
 * @returns A frozen `FilterBuilder<T>` factory
 *
 * @example
 * ```ts
 * import { createFilterBuilder, compileFilterNode } from "dynamo-schema";
 *
 * const f = createFilterBuilder<User>();
 * const node = f.and(
 *   f.eq('status', 'active'),
 *   f.gt('age', 18),
 *   f.beginsWith('email', 'admin@'),
 *   f.attributeExists('verifiedAt'),
 * );
 *
 * const compiled = compileFilterNode(node);
 * // Use compiled.expression, compiled.expressionAttributeNames,
 * // compiled.expressionAttributeValues in your query/scan options.
 * ```
 */
export const createFilterBuilder = <T>(): FilterBuilder<T> =>
  Object.freeze({
    eq: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "eq" as const, path, value }) as FilterNode,
    ne: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "ne" as const, path, value }) as FilterNode,
    lt: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "lt" as const, path, value }) as FilterNode,
    lte: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "lte" as const, path, value }) as FilterNode,
    gt: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "gt" as const, path, value }) as FilterNode,
    gte: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "gte" as const, path, value }) as FilterNode,
    between: <K extends string & keyof T>(path: K, lo: T[K], hi: T[K]) =>
      Object.freeze({ op: "between" as const, path, lo, hi }) as FilterNode,
    beginsWith: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "beginsWith" as const, path, value }) as FilterNode,
    contains: <K extends string & keyof T>(path: K, value: T[K]) =>
      Object.freeze({ op: "contains" as const, path, value }) as FilterNode,
    attributeExists: <K extends string & keyof T>(path: K) =>
      Object.freeze({ op: "attributeExists" as const, path }) as FilterNode,
    attributeNotExists: <K extends string & keyof T>(path: K) =>
      Object.freeze({ op: "attributeNotExists" as const, path }) as FilterNode,
    attributeType: <K extends string & keyof T>(
      path: K,
      type: DynamoAttributeType,
    ) =>
      Object.freeze({ op: "attributeType" as const, path, type }) as FilterNode,
    and: (...conditions: readonly [FilterNode, ...FilterNode[]]) =>
      Object.freeze({
        op: "and" as const,
        conditions: Object.freeze([...conditions]),
      }) as FilterNode,
    or: (...conditions: readonly [FilterNode, ...FilterNode[]]) =>
      Object.freeze({
        op: "or" as const,
        conditions: Object.freeze([...conditions]),
      }) as FilterNode,
    not: (condition: FilterNode) =>
      Object.freeze({ op: "not" as const, condition }) as FilterNode,
  });

/**
 * Compiles a `FilterNode` tree into a DynamoDB expression string,
 * `ExpressionAttributeNames`, and `ExpressionAttributeValues`.
 *
 * Handles reserved word aliasing, value placeholder injection, and
 * nested `AND`/`OR`/`NOT` composition automatically.
 *
 * @param node - The `FilterNode` produced by `createFilterBuilder`
 * @returns A frozen `CompiledFilter` with expression and attribute maps
 *
 * @example
 * ```ts
 * const f = createFilterBuilder<User>();
 * const compiled = compileFilterNode(
 *   f.and(f.eq('status', 'active'), f.gt('age', 18))
 * );
 *
 * // In query options:
 * await users.query({
 *   partitionKey: { userId: '123' },
 *   options: { filter: compiled },
 * });
 * ```
 */
export const compileFilterNode = (node: FilterNode): CompiledFilter => {
  let counter = 0;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  const compile = (n: FilterNode): string => {
    switch (n.op) {
      case "eq":
      case "ne":
      case "lt":
      case "lte":
      case "gt":
      case "gte": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        const valAlias = `:f${idx}`;
        names[nameAlias] = n.path;
        values[valAlias] = n.value;
        const opStr: Record<string, string> = {
          eq: "=",
          ne: "<>",
          lt: "<",
          lte: "<=",
          gt: ">",
          gte: ">=",
        };
        return `${nameAlias} ${opStr[n.op]} ${valAlias}`;
      }

      case "between": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        const loAlias = `:f${idx}lo`;
        const hiAlias = `:f${idx}hi`;
        names[nameAlias] = n.path;
        values[loAlias] = n.lo;
        values[hiAlias] = n.hi;
        return `${nameAlias} BETWEEN ${loAlias} AND ${hiAlias}`;
      }

      case "beginsWith": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        const valAlias = `:f${idx}`;
        names[nameAlias] = n.path;
        values[valAlias] = n.value;
        return `begins_with(${nameAlias}, ${valAlias})`;
      }

      case "contains": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        const valAlias = `:f${idx}`;
        names[nameAlias] = n.path;
        values[valAlias] = n.value;
        return `contains(${nameAlias}, ${valAlias})`;
      }

      case "attributeExists": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        names[nameAlias] = n.path;
        return `attribute_exists(${nameAlias})`;
      }

      case "attributeNotExists": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        names[nameAlias] = n.path;
        return `attribute_not_exists(${nameAlias})`;
      }

      case "attributeType": {
        const idx = counter++;
        const nameAlias = `#f${idx}`;
        const typeAlias = `:f${idx}`;
        names[nameAlias] = n.path;
        values[typeAlias] = n.type;
        return `attribute_type(${nameAlias}, ${typeAlias})`;
      }

      case "and": {
        if (n.conditions.length === 1) {
          return compile(n.conditions[0]!);
        }
        return `(${n.conditions.map(compile).join(" AND ")})`;
      }

      case "or": {
        if (n.conditions.length === 1) {
          return compile(n.conditions[0]!);
        }
        return `(${n.conditions.map(compile).join(" OR ")})`;
      }

      case "not": {
        return `NOT (${compile(n.condition)})`;
      }
    }
  };

  const expression = compile(node);

  return Object.freeze({
    expression,
    expressionAttributeNames: Object.freeze(names),
    expressionAttributeValues: Object.freeze(values),
  });
};

/**
 * Resolves a `FilterInput` (raw string, `FilterNode`, or callback) to a
 * `CompiledFilter`, or returns `undefined` when no filter is provided.
 *
 * Used internally by query/scan/put/delete/update operations.
 *
 * @param input - The filter/condition input to resolve
 * @returns An object with `expression`, `expressionAttributeNames`, and
 *          `expressionAttributeValues` (empty maps if input is a raw string)
 */
export const resolveFilterInput = (
  input: FilterInput | undefined,
): {
  readonly expression: string | undefined;
  readonly expressionAttributeNames: Record<string, string>;
  readonly expressionAttributeValues: Record<string, unknown>;
} => {
  if (input === undefined) {
    return {
      expression: undefined,
      expressionAttributeNames: {},
      expressionAttributeValues: {},
    };
  }

  if (typeof input === "string") {
    // Raw string — user is responsible for providing expressionNames/Values separately
    return {
      expression: input,
      expressionAttributeNames: {},
      expressionAttributeValues: {},
    };
  }

  if (typeof input === "function") {
    // Callback — invoke with an untyped builder, then compile
    const f = createFilterBuilder<Record<string, unknown>>();
    const node = (input as FilterBuilderFn<Record<string, unknown>>)(f);
    const compiled = compileFilterNode(node);
    return {
      expression: compiled.expression,
      expressionAttributeNames: compiled.expressionAttributeNames,
      expressionAttributeValues: compiled.expressionAttributeValues,
    };
  }

  // FilterNode — compile directly
  const compiled = compileFilterNode(input);
  return {
    expression: compiled.expression,
    expressionAttributeNames: compiled.expressionAttributeNames,
    expressionAttributeValues: compiled.expressionAttributeValues,
  };
};

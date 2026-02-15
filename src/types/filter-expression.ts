/**
 * Type-safe filter/condition expression builder types.
 *
 * Provides an immutable, composable API for building DynamoDB filter expressions
 * (used in query/scan) and condition expressions (used in put/delete/update) with
 * compile-time type checking on attribute names and values.
 */

/**
 * DynamoDB attribute type strings for use with `attributeType()`.
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html
 */
export type DynamoAttributeType =
  | "S"
  | "N"
  | "B"
  | "SS"
  | "NS"
  | "BS"
  | "L"
  | "M"
  | "NULL"
  | "BOOL";

/**
 * A leaf comparison node — a single condition comparing an attribute to a value.
 */
export type FilterLeafNode =
  | { readonly op: "eq"; readonly path: string; readonly value: unknown }
  | { readonly op: "ne"; readonly path: string; readonly value: unknown }
  | { readonly op: "lt"; readonly path: string; readonly value: unknown }
  | { readonly op: "lte"; readonly path: string; readonly value: unknown }
  | { readonly op: "gt"; readonly path: string; readonly value: unknown }
  | { readonly op: "gte"; readonly path: string; readonly value: unknown }
  | {
      readonly op: "between";
      readonly path: string;
      readonly lo: unknown;
      readonly hi: unknown;
    }
  | { readonly op: "beginsWith"; readonly path: string; readonly value: unknown }
  | { readonly op: "contains"; readonly path: string; readonly value: unknown }
  | { readonly op: "attributeExists"; readonly path: string }
  | { readonly op: "attributeNotExists"; readonly path: string }
  | {
      readonly op: "attributeType";
      readonly path: string;
      readonly type: DynamoAttributeType;
    };

/**
 * A composite logical node that combines multiple conditions.
 */
export type FilterCompositeNode =
  | { readonly op: "and"; readonly conditions: readonly FilterNode[] }
  | { readonly op: "or"; readonly conditions: readonly FilterNode[] }
  | { readonly op: "not"; readonly condition: FilterNode };

/**
 * A single filter/condition node — either a leaf comparison or a logical composite.
 */
export type FilterNode = FilterLeafNode | FilterCompositeNode;

/**
 * Compiled filter/condition result containing the DynamoDB expression string
 * and the attribute name/value maps needed to execute it.
 */
export interface CompiledFilter {
  readonly expression: string;
  readonly expressionAttributeNames: Record<string, string>;
  readonly expressionAttributeValues: Record<string, unknown>;
}

/**
 * Type-safe filter/condition expression builder.
 *
 * Methods return immutable `FilterNode` values that can be composed with
 * `and`, `or`, and `not`. Call `compileFilterNode(node)` to get the
 * DynamoDB expression string and attribute maps.
 *
 * @example
 * ```ts
 * const f = createFilterBuilder<User>();
 * const node = f.and(
 *   f.eq('status', 'active'),
 *   f.gt('age', 18),
 *   f.attributeExists('verifiedAt'),
 * );
 * const compiled = compileFilterNode(node);
 * // compiled.expression, compiled.expressionAttributeNames, compiled.expressionAttributeValues
 * ```
 */
export interface FilterBuilder<T> {
  /** `attr = value` */
  readonly eq: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr <> value` */
  readonly ne: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr < value` */
  readonly lt: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr <= value` */
  readonly lte: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr > value` */
  readonly gt: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr >= value` */
  readonly gte: <K extends string & keyof T>(path: K, value: T[K]) => FilterNode;
  /** `attr BETWEEN lo AND hi` */
  readonly between: <K extends string & keyof T>(
    path: K,
    lo: T[K],
    hi: T[K],
  ) => FilterNode;
  /** `begins_with(attr, prefix)` */
  readonly beginsWith: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => FilterNode;
  /** `contains(attr, operand)` */
  readonly contains: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => FilterNode;
  /** `attribute_exists(attr)` */
  readonly attributeExists: <K extends string & keyof T>(path: K) => FilterNode;
  /** `attribute_not_exists(attr)` */
  readonly attributeNotExists: <K extends string & keyof T>(path: K) => FilterNode;
  /** `attribute_type(attr, type)` */
  readonly attributeType: <K extends string & keyof T>(
    path: K,
    type: DynamoAttributeType,
  ) => FilterNode;
  /** `(cond1 AND cond2 AND ...)` — requires at least one condition */
  readonly and: (...conditions: readonly [FilterNode, ...FilterNode[]]) => FilterNode;
  /** `(cond1 OR cond2 OR ...)` — requires at least one condition */
  readonly or: (...conditions: readonly [FilterNode, ...FilterNode[]]) => FilterNode;
  /** `NOT (cond)` */
  readonly not: (condition: FilterNode) => FilterNode;
}

/**
 * A callback that receives a `FilterBuilder` and returns a `FilterNode`.
 * Used for inline filter/condition expression definitions.
 *
 * @example
 * ```ts
 * const filter: FilterBuilderFn = (f) => f.and(
 *   f.eq('status', 'active'),
 *   f.gt('age', 18),
 * );
 * ```
 */
export type FilterBuilderFn<T = Record<string, unknown>> = (
  f: FilterBuilder<T>,
) => FilterNode;

/**
 * Accepted formats for a filter/condition expression:
 * - A raw DynamoDB expression string (legacy — requires manual `expressionNames`/`expressionValues`)
 * - A `FilterNode` (pre-built from `createFilterBuilder`)
 * - A callback `(f) => FilterNode` (inline, receives an untyped builder)
 *
 * For type-safe attribute checking, build the node with `createFilterBuilder<MyType>()`.
 */
export type FilterInput<T = Record<string, unknown>> =
  | string
  | FilterNode
  | FilterBuilderFn<T>;

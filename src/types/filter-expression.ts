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
 * Identifies the attribute a filter/condition applies to.
 *
 * - A **string** is a single top-level attribute name, used as-is. A `.` is
 *   part of the name: `"address.city"` is an attribute literally named
 *   `address.city`, not a nested path.
 * - A **tuple** is a path into nested maps and lists: string segments are map
 *   keys and number segments are list indexes. `["address", "city"]` compiles
 *   to `#f0_0.#f0_1`, and `["tags", 0]` to `#f0_0[0]`.
 */
export type AttributePath = string | readonly [string, ...(string | number)[]];

/**
 * The path argument accepted by the typed {@link FilterBuilder}: a top-level
 * key of `T`, or a nested path tuple whose first segment is a key of `T`.
 */
export type FilterPath<T> =
  | (string & keyof T)
  | readonly [string & keyof T, ...(string | number)[]];

/**
 * The value type for a {@link FilterPath}: the attribute's type for a
 * top-level key, and `unknown` for a nested path.
 */
export type FilterPathValue<T, P> = P extends keyof T ? T[P] : unknown;

/**
 * A leaf comparison node — a single condition comparing an attribute to a value.
 */
export type FilterLeafNode =
  | { readonly op: "eq"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "ne"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "lt"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "lte"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "gt"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "gte"; readonly path: AttributePath; readonly value: unknown }
  | {
      readonly op: "between";
      readonly path: AttributePath;
      readonly lo: unknown;
      readonly hi: unknown;
    }
  | { readonly op: "beginsWith"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "contains"; readonly path: AttributePath; readonly value: unknown }
  | { readonly op: "attributeExists"; readonly path: string }
  | { readonly op: "attributeNotExists"; readonly path: string }
  | {
      readonly op: "attributeType";
      readonly path: AttributePath;
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
  readonly eq: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr <> value` */
  readonly ne: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr < value` */
  readonly lt: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr <= value` */
  readonly lte: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr > value` */
  readonly gt: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr >= value` */
  readonly gte: <P extends FilterPath<T>>(path: P, value: FilterPathValue<T, P>) => FilterNode;
  /** `attr BETWEEN lo AND hi` */
  readonly between: <P extends FilterPath<T>>(
    path: P,
    lo: FilterPathValue<T, P>,
    hi: FilterPathValue<T, P>,
  ) => FilterNode;
  /** `begins_with(attr, prefix)` */
  readonly beginsWith: <P extends FilterPath<T>>(
    path: P,
    value: FilterPathValue<T, P>,
  ) => FilterNode;
  /** `contains(attr, operand)` */
  readonly contains: <P extends FilterPath<T>>(
    path: P,
    value: FilterPathValue<T, P>,
  ) => FilterNode;
  /** `attribute_exists(attr)` */
  readonly attributeExists: <P extends FilterPath<T>>(path: P) => FilterNode;
  /** `attribute_not_exists(attr)` */
  readonly attributeNotExists: <P extends FilterPath<T>>(path: P) => FilterNode;
  /** `attribute_type(attr, type)` */
  readonly attributeType: <P extends FilterPath<T>>(
    path: P,
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

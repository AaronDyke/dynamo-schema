/**
 * Type-safe update expression builder types.
 *
 * Provides a chainable, immutable API for building DynamoDB update expressions
 * with compile-time type checking on attribute names and values.
 */

/** A single SET action. */
export interface SetAction {
  readonly path: string;
  readonly value: unknown;
}

/** A single SET if_not_exists action. */
export interface SetIfNotExistsAction {
  readonly path: string;
  readonly value: unknown;
}

/** A single ADD action (for numbers and sets). */
export interface AddAction {
  readonly path: string;
  readonly value: unknown;
}

/** A single DELETE action (for sets). */
export interface DeleteAction {
  readonly path: string;
  readonly value: unknown;
}

/** Accumulated update actions from the builder. */
export interface UpdateActions {
  readonly sets: readonly SetAction[];
  readonly setIfNotExists: readonly SetIfNotExistsAction[];
  readonly removes: readonly string[];
  readonly adds: readonly AddAction[];
  readonly deletes: readonly DeleteAction[];
}

/**
 * Type-safe update expression builder.
 *
 * Each method returns a new builder (immutable chain).
 * Call `build()` to get the accumulated actions.
 *
 * @example
 * ```ts
 * const actions = builder
 *   .set("name", "Alice")
 *   .set("age", 31)
 *   .setIfNotExists("createdAt", Date.now())
 *   .remove("temporaryField")
 *   .add("loginCount", 1)
 *   .build();
 * ```
 */
export interface UpdateBuilder<T> {
  /** SET an attribute to a value. */
  readonly set: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => UpdateBuilder<T>;

  /** SET an attribute to a value only if the attribute does not already exist (uses DynamoDB's if_not_exists function). */
  readonly setIfNotExists: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => UpdateBuilder<T>;

  /** REMOVE an attribute. */
  readonly remove: <K extends string & keyof T>(
    path: K,
  ) => UpdateBuilder<T>;

  /** ADD a value to a number attribute or elements to a set attribute. */
  readonly add: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => UpdateBuilder<T>;

  /** DELETE elements from a set attribute. */
  readonly delete: <K extends string & keyof T>(
    path: K,
    value: T[K],
  ) => UpdateBuilder<T>;

  /** Build the accumulated actions. */
  readonly build: () => UpdateActions;
}

/**
 * Utilities for generating ExpressionAttributeNames.
 *
 * Handles aliasing attribute names that conflict with DynamoDB reserved words
 * or contain characters that require aliasing in DynamoDB expressions.
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html
 */

/**
 * Complete set of DynamoDB reserved words (stored in uppercase for case-insensitive lookup).
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html
 */
export const DYNAMO_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "ABORT", "ABSOLUTE", "ACTION", "ADD", "AFTER", "AGENT", "AGGREGATE", "ALL",
  "ALLOCATE", "ALTER", "ANALYZE", "AND", "ANY", "ARCHIVE", "ARE", "ARRAY",
  "AS", "ASC", "ASCII", "ASENSITIVE", "ASSERTION", "ASYMMETRIC", "AT",
  "ATOMIC", "ATTACH", "ATTRIBUTE", "AUTH", "AUTHORIZATION", "AUTHORIZE",
  "AUTO", "AVG", "BACK", "BACKUP", "BASE", "BATCH", "BEFORE", "BEGIN",
  "BETWEEN", "BIGINT", "BINARY", "BIT", "BLOB", "BLOCK", "BOOLEAN", "BOTH",
  "BREADTH", "BUCKET", "BULK", "BY", "BYTE", "CALL", "CALLED", "CALLING",
  "CAPACITY", "CASCADE", "CASCADED", "CASE", "CAST", "CATALOG", "CHAR",
  "CHARACTER", "CHECK", "CLASS", "CLOB", "CLOSE", "CLUSTER", "CLUSTERED",
  "CLUSTERING", "CLUSTERS", "COALESCE", "COLLATE", "COLLATION", "COLLECTION",
  "COLUMN", "COLUMNS", "COMBINE", "COMMENT", "COMMIT", "COMPACT", "COMPILE",
  "COMPRESS", "CONDITION", "CONFLICT", "CONNECT", "CONNECTION", "CONSISTENCY",
  "CONSISTENT", "CONSTRAINT", "CONSTRAINTS", "CONSTRUCTOR", "CONSUMED",
  "CONTINUE", "CONVERT", "COPY", "CORRESPONDING", "COUNT", "COUNTER",
  "CREATE", "CROSS", "CUBE", "CURRENT", "CURSOR", "CYCLE", "DATA",
  "DATABASE", "DATE", "DATETIME", "DAY", "DEALLOCATE", "DEC", "DECIMAL",
  "DECLARE", "DEFAULT", "DEFERRABLE", "DEFERRED", "DEFINE", "DEFINED",
  "DEFINITION", "DELETE", "DELIMITED", "DEPTH", "DEREF", "DESC", "DESCRIBE",
  "DESCRIPTOR", "DETACH", "DETERMINISTIC", "DIAGNOSTICS", "DIRECTORIES",
  "DISABLE", "DISCONNECT", "DISTINCT", "DISTRIBUTE", "DO", "DOMAIN",
  "DOUBLE", "DROP", "DUMP", "DURATION", "DYNAMIC", "EACH", "ELEMENT",
  "ELSE", "ELSEIF", "EMPTY", "ENABLE", "END", "EQUAL", "EQUALS", "ERROR",
  "ESCAPE", "ESCAPED", "EVAL", "EVALUATE", "EXCEEDED", "EXCEPT", "EXCEPTION",
  "EXCEPTIONS", "EXCLUSIVE", "EXEC", "EXECUTE", "EXISTS", "EXIT", "EXPLAIN",
  "EXPLODE", "EXPORT", "EXPRESSION", "EXTENDED", "EXTERNAL", "EXTRACT",
  "FAIL", "FALSE", "FAMILY", "FETCH", "FIELDS", "FILE", "FILTER",
  "FILTERING", "FINAL", "FINISH", "FIRST", "FIXED", "FLATTERN", "FLOAT",
  "FOR", "FORCE", "FOREIGN", "FORMAT", "FORWARD", "FOUND", "FREE", "FROM",
  "FULL", "FUNCTION", "FUNCTIONS", "GENERAL", "GENERATE", "GET", "GLOB",
  "GLOBAL", "GO", "GOTO", "GRANT", "GREATER", "GROUP", "GROUPING",
  "HANDLER", "HASH", "HAVE", "HAVING", "HEAP", "HIDDEN", "HOLD", "HOUR",
  "IDENTIFIED", "IDENTITY", "IF", "IGNORE", "IMMEDIATE", "IMPORT", "IN",
  "INCLUDING", "INCLUSIVE", "INCREMENT", "INCREMENTAL", "INDEX", "INDEXED",
  "INDEXES", "INDICATOR", "INFINITE", "INITIALLY", "INLINE", "INNER",
  "INNTER", "INOUT", "INPUT", "INSENSITIVE", "INSERT", "INSTEAD", "INT",
  "INTEGER", "INTERSECT", "INTERVAL", "INTO", "INVALIDATE", "IS",
  "ISOLATION", "ITEM", "ITEMS", "ITERATE", "JOIN", "KEY", "KEYS", "LAG",
  "LANGUAGE", "LARGE", "LAST", "LATERAL", "LEAD", "LEADING", "LEAVE",
  "LEFT", "LENGTH", "LESS", "LEVEL", "LIKE", "LIMIT", "LIMITED", "LINES",
  "LIST", "LOAD", "LOCAL", "LOCALTIME", "LOCALTIMESTAMP", "LOCATION",
  "LOCATOR", "LOCK", "LOCKS", "LOG", "LOGED", "LONG", "LOOP", "LOWER",
  "MAP", "MATCH", "MATERIALIZED", "MAX", "MAXLEN", "MEMBER", "MERGE",
  "METHOD", "METRICS", "MIN", "MINUS", "MINUTE", "MISSING", "MOD", "MODE",
  "MODIFIES", "MODIFY", "MODULE", "MONTH", "MULTI", "MULTISET", "NAME",
  "NAMES", "NATIONAL", "NATURAL", "NCHAR", "NCLOB", "NEW", "NEXT", "NO",
  "NONE", "NOT", "NULL", "NULLIF", "NUMBER", "NUMERIC", "OBJECT", "OF",
  "OFFLINE", "OFFSET", "OLD", "ON", "ONLINE", "ONLY", "OPAQUE", "OPEN",
  "OPERATOR", "OPTION", "OR", "ORDER", "ORDINALITY", "OTHER", "OTHERS",
  "OUT", "OUTER", "OUTPUT", "OVER", "OVERLAPS", "OVERRIDE", "OWNER", "PAD",
  "PARALLEL", "PARAMETER", "PARAMETERS", "PARTIAL", "PARTITION",
  "PARTITIONED", "PARTITIONS", "PATH", "PERCENT", "PERCENTILE", "PERMISSION",
  "PERMISSIONS", "PIPE", "PIPELINED", "PLAN", "POOL", "POSITION",
  "PRECISION", "PREPARE", "PRESERVE", "PRIMARY", "PRIOR", "PRIVATE",
  "PRIVILEGES", "PROCEDURE", "PROCESSED", "PROJECT", "PROJECTION",
  "PROPERTY", "PROVISIONING", "PUBLIC", "PUT", "QUERY", "QUIT", "QUORUM",
  "RAISE", "RANDOM", "RANGE", "RANK", "RAW", "READ", "READS", "REAL",
  "REBUILD", "RECORD", "RECURSIVE", "REDUCE", "REF", "REFERENCE",
  "REFERENCES", "REFERENCING", "REGEXP", "REGION", "REINDEX", "RELATIVE",
  "RELEASE", "REMAINDER", "RENAME", "REPEAT", "REPLACE", "REQUEST", "RESET",
  "RESIGNAL", "RESOURCE", "RESPONSE", "RESTORE", "RESTRICT", "RESULT",
  "RETURN", "RETURNING", "RETURNS", "REVERSE", "REVOKE", "RIGHT", "ROLE",
  "ROLES", "ROLLBACK", "ROLLUP", "ROUTINE", "ROW", "ROWS", "RULE", "RULES",
  "SAMPLE", "SATISFIES", "SAVE", "SAVEPOINT", "SCAN", "SCHEMA", "SCOPE",
  "SCROLL", "SEARCH", "SECOND", "SECTION", "SEGMENT", "SEGMENTS", "SELECT",
  "SELF", "SEMI", "SENSITIVE", "SEPARATE", "SEQUENCE", "SERIALIZABLE",
  "SESSION", "SET", "SETS", "SHARD", "SHARE", "SHARED", "SHORT", "SHOW",
  "SIGNAL", "SIMILAR", "SIZE", "SKEWED", "SMALLINT", "SNAPSHOT", "SOME",
  "SOURCE", "SPACE", "SPACES", "SPARSE", "SPECIFIC", "SPECIFICTYPE", "SPLIT",
  "SQL", "SQLCODE", "SQLERROR", "SQLEXCEPTION", "SQLSTATE", "SQLWARNING",
  "START", "STATE", "STATIC", "STATUS", "STORAGE", "STORE", "STORED",
  "STREAM", "STRING", "STRUCT", "STYLE", "SUB", "SUBMULTISET", "SUBPARTITION",
  "SUBSTRING", "SUBTYPE", "SUM", "SUPER", "SYMMETRIC", "SYNONYM", "SYSTEM",
  "TABLE", "TABLESAMPLE", "TEMP", "TEMPORARY", "TERMINATED", "TEXT", "THAN",
  "THEN", "THROUGHPUT", "TIME", "TIMESTAMP", "TIMEZONE", "TINYINT", "TO",
  "TOKEN", "TOTAL", "TOUCH", "TRAILING", "TRANSACTION", "TRANSFORM",
  "TRANSLATE", "TRANSLATION", "TREAT", "TRIGGER", "TRIM", "TRUE", "TRUNCATE",
  "TTL", "TUPLE", "TYPE", "UNDER", "UNDO", "UNION", "UNIQUE", "UNIT",
  "UNKNOWN", "UNLOGGED", "UNNEST", "UNPROCESSED", "UNSIGNED", "UNTIL",
  "UPDATE", "UPPER", "URL", "USAGE", "USE", "USER", "USERS", "USING", "UUID",
  "VACUUM", "VALUE", "VALUED", "VALUES", "VARCHAR", "VARIABLE", "VARIANCE",
  "VARINT", "VARYING", "VIEW", "VIEWS", "VIRTUAL", "VOID", "WAIT", "WHEN",
  "WHENEVER", "WHERE", "WHILE", "WINDOW", "WITH", "WITHIN", "WITHOUT",
  "WORK", "WRAPPED", "WRITE", "YEAR", "ZONE",
]);

/**
 * Returns true if the given word is a DynamoDB reserved word.
 * The check is case-insensitive.
 *
 * @param word - The word to check
 * @returns true if the word is a DynamoDB reserved word
 *
 * @example
 * isReservedWord("name")   // true — NAME is reserved
 * isReservedWord("userId") // false
 * isReservedWord("STATUS") // true
 */
export const isReservedWord = (word: string): boolean =>
  DYNAMO_RESERVED_WORDS.has(word.toUpperCase());

/**
 * Returns true if the attribute name requires an Expression Attribute Name alias.
 *
 * Aliasing is required when the name:
 * - Is a DynamoDB reserved word (case-insensitive), or
 * - Contains characters outside `[a-zA-Z0-9_]` (e.g. dots, spaces, dashes)
 *
 * @param name - The attribute name to check
 * @returns true if the name must be aliased
 *
 * @example
 * needsAlias("name")         // true — reserved word
 * needsAlias("user.email")   // true — contains dot
 * needsAlias("userId")       // false
 */
export const needsAlias = (name: string): boolean =>
  isReservedWord(name) || /[^a-zA-Z0-9_]/.test(name);

/**
 * Creates an alias for an attribute name suitable for use in DynamoDB expressions.
 *
 * @param name - The attribute name
 * @returns The aliased name prefixed with `#` (e.g. `"#name"` for `"name"`)
 */
export const aliasAttributeName = (name: string): string => `#${name}`;

/**
 * Builds an ExpressionAttributeNames map from a list of attribute names.
 * Only includes names that require aliasing (reserved words or names with special characters).
 *
 * @param names - The attribute names to process
 * @returns A frozen record mapping `#alias` keys to the original attribute names
 *
 * @example
 * buildExpressionAttributeNames(["userId", "name", "status"])
 * // { "#name": "name", "#status": "status" }
 */
export const buildExpressionAttributeNames = (
  names: readonly string[],
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const name of names) {
    if (needsAlias(name)) {
      result[aliasAttributeName(name)] = name;
    }
  }
  return Object.freeze(result);
};

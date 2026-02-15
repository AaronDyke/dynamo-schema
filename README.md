# dynamo-schema

Type-safe DynamoDB schema validation and modeling for TypeScript. Works with any [Standard Schema](https://standardschema.dev) compatible validation library (Zod, Valibot, ArkType, etc.).

## Features

- **Standard Schema compatible** -- bring your own validation library (Zod, Valibot, ArkType, or any Standard Schema V1 implementation)
- **Full type inference** -- entity types are inferred from your schemas, keys are validated at compile time
- **Single-table design** -- define multiple entities on the same table with different key patterns and indexes
- **Template keys** -- use `"USER#{{userId}}"` patterns or simple field references for partition and sort keys
- **All DynamoDB operations** -- Put, Get, Delete, Update, Query, Scan, BatchWrite, BatchGet, TransactWrite, TransactGet
- **Type-safe update builder** -- chainable, immutable expression builder with autocomplete on attribute names
- **TTL support** -- configure a TTL attribute on the table, auto-inject expiry on `put`, auto-refresh on `update`, and remove TTL from a specific item
- **Lifecycle hooks** -- attach cross-cutting behavior (`beforePut`, `beforeUpdate`, `afterGet`, `beforeDelete`) to any entity for audit logging, soft-delete, auto-timestamps, and more
- **Runtime validation** -- validates inputs/outputs through Standard Schema at runtime (configurable)
- **SDK flexible** -- supports AWS SDK v2 and v3, both raw DynamoDB client and DocumentClient
- **Zero runtime dependencies** -- marshalling, validation wrappers, and Standard Schema types are all self-contained
- **Result-based error handling** -- all operations return `Result<T, DynamoError>` instead of throwing

## Installation

```bash
npm install dynamo-schema
```

You also need your chosen schema library and AWS SDK:

```bash
# Schema library (pick one)
npm install zod
# or: npm install valibot
# or: npm install arktype

# AWS SDK v3 (recommended)
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Or AWS SDK v2
npm install aws-sdk
```

## Quick Start

```typescript
import { defineTable, defineEntity, createClient } from "dynamo-schema";
import { createSDKv3DocAdapter } from "dynamo-schema/adapters/sdk-v3-doc";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

// 1. Define your table
const table = defineTable({
  tableName: "MainTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
});

// 2. Define your entity with a Zod schema (or any Standard Schema)
const userSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().int().positive(),
});

const userEntity = defineEntity({
  name: "User",
  schema: userSchema,
  table,
  partitionKey: "USER#{{userId}}",
  sortKey: "PROFILE",
});

// 3. Create the client
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const adapter = createSDKv3DocAdapter(ddbClient, {
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
});
const client = createClient({ adapter });

// 4. Get a type-safe entity client
const users = client.entity(userEntity);

// 5. Use it
const putResult = await users.put({
  userId: "123",
  email: "alice@example.com",
  name: "Alice",
  age: 30,
});

if (putResult.success) {
  console.log("User created");
} else {
  console.error(putResult.error.message);
}
```

---

## Core Concepts

### Defining a Table

`defineTable()` creates an immutable table definition describing your DynamoDB table's key structure and indexes.

```typescript
import { defineTable } from "dynamo-schema";

const table = defineTable({
  tableName: "MainTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
  indexes: {
    gsi1: {
      type: "GSI",
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
      sortKey: { name: "gsi1sk", definition: "gsi1sk" },
    },
    gsi2: {
      type: "GSI",
      indexName: "GSI2",
      partitionKey: { name: "gsi2pk", definition: "gsi2pk" },
    },
    lsi1: {
      type: "LSI",
      indexName: "LSI1",
      partitionKey: { name: "pk", definition: "pk" },
      sortKey: { name: "lsi1sk", definition: "lsi1sk" },
    },
  },
});
```

**`KeyAttribute` properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The DynamoDB attribute name (e.g., `"pk"`, `"gsi1pk"`) |
| `definition` | `string` | A key template or field reference |
| `type` | `"S" \| "N" \| "B"` | Optional. The DynamoDB attribute type |

### Defining an Entity

`defineEntity()` binds a Standard Schema to a table with key mappings. The library validates at compile time that all template fields exist in the schema's output type.

```typescript
import { defineEntity } from "dynamo-schema";
import { z } from "zod";

const userSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  age: z.number(),
  role: z.enum(["admin", "user"]),
});

const userEntity = defineEntity({
  name: "User",
  schema: userSchema,
  table,
  partitionKey: "USER#{{userId}}",       // template key
  sortKey: "PROFILE",                     // static sort key
  indexes: {
    gsi1: {
      partitionKey: "{{role}}",           // index partition key
      sortKey: "USER#{{userId}}",         // index sort key
    },
  },
});
```

**Key definition formats:**

| Format | Example | Description |
|--------|---------|-------------|
| Template | `"USER#{{userId}}"` | Substitutes `userId` field from entity data |
| Multi-field template | `"{{orgId}}#{{date}}"` | Combines multiple fields |
| Static value | `"PROFILE"` | Uses the literal string as-is |
| Simple field | `"userId"` | Uses the field value directly (no `{{}}` needed when the entire key is one field) |

### TTL Configuration

TTL is configured in two places: the **table** (which attribute DynamoDB uses for expiry) and the **entity** (how that attribute is managed automatically).

#### Table-level TTL

Tell DynamoDB which attribute holds the expiry timestamp. This attribute must be a `Number` type in DynamoDB and TTL must be enabled on the table in AWS.

```typescript
const table = defineTable({
  tableName: "MainTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
  ttl: { attributeName: "expiresAt" },
});
```

#### Entity-level TTL behavior

Control automatic TTL injection per entity:

```typescript
const sessionEntity = defineEntity({
  name: "Session",
  schema: sessionSchema,
  table,
  partitionKey: "SESSION#{{sessionId}}",
  sortKey: "METADATA",
  ttl: {
    // Auto-inject this TTL value on every put (30 days from now)
    defaultTtlSeconds: 60 * 60 * 24 * 30,
    // Refresh the TTL on every update (sliding expiry)
    autoUpdateTtlSeconds: 60 * 60 * 24 * 30,
  },
});
```

Both fields are optional and independent. For example, you can set `autoUpdateTtlSeconds` without `defaultTtlSeconds` if you want sliding expiry on updates but not automatic injection on creation.

The TTL value injected is always `Math.floor(Date.now() / 1000) + <seconds>` (Unix epoch seconds, as required by DynamoDB).

### Type Inference

The library infers TypeScript types from your schema definitions:

```typescript
import type { InferEntityType, EntityKeyInput } from "dynamo-schema";

// Infer the entity's data type from the schema
type User = InferEntityType<typeof userEntity>;
// => { userId: string; email: string; name: string; age: number; role: "admin" | "user" }

// Infer the key input type (fields needed to identify an item)
type UserKey = EntityKeyInput<typeof userEntity>;
// => { readonly userId: string }
```

---

## Operations

All operations return `Result<T, DynamoError>`. Check `result.success` to determine if the operation succeeded.

### Put

Writes an item to the table. The item is validated against the entity schema before writing. If the entity has `ttl.defaultTtlSeconds` configured, the TTL attribute is automatically injected.

```typescript
const result = await users.put({
  userId: "123",
  email: "alice@example.com",
  name: "Alice",
  age: 30,
  role: "user",
});

if (!result.success) {
  // result.error.type is "validation" | "key" | "marshalling" | "dynamo"
  console.error(result.error.type, result.error.message);
}
```

If the entity has a `defaultTtlSeconds` configured, the TTL attribute is computed and written automatically — you do not need to include it in your data:

```typescript
// Entity configured with ttl: { defaultTtlSeconds: 3600 }
// The "expiresAt" attribute is injected automatically (now + 1 hour)
await sessions.put({ sessionId: "abc", userId: "123" });
```

**Options:**

```typescript
await users.put(data, {
  condition: "attribute_not_exists(pk)",           // condition expression
  expressionNames: { "#pk": "pk" },                // expression attribute names
  expressionValues: {},                             // expression attribute values
  skipValidation: true,                             // skip runtime schema validation
});
```

### Get

Retrieves a single item by key. Returns `undefined` if not found.

```typescript
const result = await users.get({ userId: "123" });

if (result.success) {
  if (result.data) {
    console.log(result.data.name);  // fully typed as User
  } else {
    console.log("User not found");
  }
}
```

**Options:**

```typescript
await users.get({ userId: "123" }, {
  consistentRead: true,
  projection: ["name", "email"],    // only return these attributes
});
```

### Delete

Deletes an item by key.

```typescript
const result = await users.delete({ userId: "123" });
```

**Options:**

```typescript
await users.delete({ userId: "123" }, {
  condition: "#role <> :admin",
  expressionNames: { "#role": "role" },
  expressionValues: { ":admin": "admin" },
});
```

### Update

Updates an item using a type-safe expression builder. The builder provides autocomplete on attribute names and type checks values.

```typescript
const result = await users.update(
  { userId: "123" },
  (u) => u
    .set("name", "Alice Smith")          // SET name = "Alice Smith"
    .set("age", 31)                      // SET age = 31
    .setIfNotExists("createdAt", "2024-01-01") // SET createdAt = if_not_exists(createdAt, "2024-01-01")
    .remove("temporaryField")            // REMOVE temporaryField
    .add("loginCount", 1)               // ADD loginCount 1
);
```

**Builder methods:**

| Method | DynamoDB Action | Description |
|--------|----------------|-------------|
| `.set(path, value)` | `SET` | Set an attribute to a value |
| `.setIfNotExists(path, value)` | `SET` | Set an attribute only if it does not already exist (uses `if_not_exists`) |
| `.remove(path)` | `REMOVE` | Remove an attribute |
| `.add(path, value)` | `ADD` | Add to a number or add elements to a set |
| `.delete(path, value)` | `DELETE` | Remove elements from a set |

**`setIfNotExists` example — initializing fields on first update:**

```typescript
// Set createdAt on first update, never overwrite it on subsequent updates.
// Set updatedAt unconditionally on every update.
await users.update(
  { userId: "123" },
  (u) => u
    .setIfNotExists("createdAt", new Date().toISOString())
    .set("updatedAt", new Date().toISOString())
    .set("name", "Alice Smith"),
);
// Produces:
// SET #sne0_createdAt = if_not_exists(#sne0_createdAt, :sne0_createdAt),
//     #s0_updatedAt = :s0_updatedAt,
//     #s1_name = :s1_name
```

**Update with condition:**

```typescript
await users.update(
  { userId: "123" },
  (u) => u.set("email", "newemail@example.com"),
  {
    condition: "#age > :minAge",
    expressionNames: { "#age": "age" },
    expressionValues: { ":minAge": 18 },
  },
);
```

**TTL auto-refresh on update:**

If the entity has `ttl.autoUpdateTtlSeconds` configured, a `SET` action for the TTL attribute is automatically appended to every update expression (sliding expiry). To suppress this for a specific update, pass `skipAutoTtl: true`:

```typescript
// Entity configured with ttl: { autoUpdateTtlSeconds: 3600 }

// Normal update — TTL is automatically refreshed to now + 1 hour
await sessions.update({ sessionId: "abc" }, (u) => u.set("lastSeen", Date.now()));

// Administrative update — TTL is NOT refreshed
await sessions.update(
  { sessionId: "abc" },
  (u) => u.set("flagged", true),
  { skipAutoTtl: true },
);
```

### Remove TTL

Removes the TTL attribute from an existing item, preventing it from expiring. Requires the entity's table to have a `ttl` config.

```typescript
const result = await sessions.removeTtl({ sessionId: "abc" });

if (result.success) {
  console.log("Session will no longer expire");
} else {
  // result.error.type === "validation" if table has no TTL configured
  console.error(result.error.message);
}
```

### Query

Queries items by partition key with optional sort key conditions.

```typescript
const result = await users.query({
  partitionKey: { userId: "123" },
  sortKeyCondition: { beginsWith: "PROFILE" },
});

if (result.success) {
  for (const user of result.data.items) {
    console.log(user.name);  // typed as User
  }

  // Pagination
  if (result.data.lastKey) {
    const nextPage = await users.query({
      partitionKey: { userId: "123" },
      options: { startKey: result.data.lastKey },
    });
  }
}
```

**Sort key conditions:**

| Condition | Example | DynamoDB Expression |
|-----------|---------|-------------------|
| `eq` | `{ eq: "PROFILE" }` | `sk = :sk` |
| `lt` | `{ lt: "ORDER#2024" }` | `sk < :sk` |
| `lte` | `{ lte: "ORDER#2024" }` | `sk <= :sk` |
| `gt` | `{ gt: "ORDER#2024" }` | `sk > :sk` |
| `gte` | `{ gte: "ORDER#2024" }` | `sk >= :sk` |
| `between` | `{ between: ["ORDER#2024-01", "ORDER#2024-12"] }` | `sk BETWEEN :skLo AND :skHi` |
| `beginsWith` | `{ beginsWith: "ORDER#" }` | `begins_with(sk, :sk)` |

**Query options:**

```typescript
await users.query({
  partitionKey: { userId: "123" },
  sortKeyCondition: { beginsWith: "ORDER#" },
  options: {
    indexName: "GSI1",                        // query a secondary index
    filter: "#status = :active",              // filter expression
    expressionNames: { "#status": "status" },
    expressionValues: { ":active": "active" },
    limit: 10,                                // max items per page
    scanIndexForward: false,                  // reverse order
    consistentRead: true,
    projection: ["name", "email"],
    startKey: previousResult.data.lastKey,    // pagination
  },
});
```

### Scan

Scans all items in a table or index.

```typescript
const result = await users.scan();

if (result.success) {
  console.log(`Found ${result.data.count} items`);
  for (const user of result.data.items) {
    console.log(user.name);
  }
}
```

**Scan with filter:**

```typescript
await users.scan({
  filter: "#age > :minAge",
  expressionNames: { "#age": "age" },
  expressionValues: { ":minAge": 21 },
  limit: 100,
  indexName: "GSI1",
});
```

---

## Batch Operations

### Batch Write

Writes or deletes multiple items across entities. Automatically chunks into groups of 25 (the DynamoDB limit) and retries unprocessed items once.

```typescript
const result = await client.batchWrite([
  {
    type: "put",
    entity: userEntity,
    data: { userId: "1", email: "alice@example.com", name: "Alice", age: 30, role: "user" },
  },
  {
    type: "put",
    entity: userEntity,
    data: { userId: "2", email: "bob@example.com", name: "Bob", age: 25, role: "admin" },
  },
  {
    type: "delete",
    entity: userEntity,
    keyInput: { userId: "old-user" },
  },
]);
```

### Batch Get

Retrieves multiple items across entities. Automatically chunks into groups of 100 (the DynamoDB limit) and retries unprocessed keys once.

```typescript
const result = await client.batchGet([
  {
    entity: userEntity,
    keys: [
      { userId: "1" },
      { userId: "2" },
      { userId: "3" },
    ],
    consistentRead: true,
  },
]);

if (result.success) {
  // Responses are grouped by entity name
  const users = result.data.responses["User"];
  for (const user of users ?? []) {
    console.log(user);
  }
}
```

---

## Transactions

### Transact Write

Executes up to 100 write operations atomically. Supports put, delete, update, and condition checks.

```typescript
const result = await client.transactWrite([
  {
    type: "put",
    entity: userEntity,
    data: { userId: "123", email: "alice@example.com", name: "Alice", age: 30, role: "user" },
    condition: "attribute_not_exists(pk)",
  },
  {
    type: "update",
    entity: orderEntity,
    keyInput: { userId: "123", orderId: "order-1" },
    builderFn: (u) => u.set("status", "confirmed"),
  },
  {
    type: "delete",
    entity: cartEntity,
    keyInput: { userId: "123" },
  },
  {
    type: "conditionCheck",
    entity: inventoryEntity,
    keyInput: { productId: "prod-1" },
    condition: "#stock > :zero",
    expressionNames: { "#stock": "stock" },
    expressionValues: { ":zero": 0 },
  },
]);
```

### Transact Get

Retrieves up to 100 items atomically. Results are returned in the same order as the requests.

```typescript
const result = await client.transactGet([
  { entity: userEntity, keyInput: { userId: "123" } },
  { entity: orderEntity, keyInput: { userId: "123", orderId: "order-1" } },
]);

if (result.success) {
  const [user, order] = result.data.items;
  // user and order are Record<string, unknown> | undefined
}
```

---

## Single-Table Design

The library is designed for single-table patterns where multiple entity types share one DynamoDB table.

```typescript
import { defineTable, defineEntity, createClient } from "dynamo-schema";
import { z } from "zod";

// One table for everything
const table = defineTable({
  tableName: "AppTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
  indexes: {
    gsi1: {
      type: "GSI",
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
      sortKey: { name: "gsi1sk", definition: "gsi1sk" },
    },
  },
});

// User entity
const userEntity = defineEntity({
  name: "User",
  schema: z.object({
    userId: z.string(),
    email: z.string(),
    name: z.string(),
  }),
  table,
  partitionKey: "USER#{{userId}}",
  sortKey: "PROFILE",
  indexes: {
    gsi1: {
      partitionKey: "{{email}}",
      sortKey: "USER#{{userId}}",
    },
  },
});

// Order entity (same table, different key pattern)
const orderEntity = defineEntity({
  name: "Order",
  schema: z.object({
    userId: z.string(),
    orderId: z.string(),
    total: z.number(),
    status: z.enum(["pending", "shipped", "delivered"]),
    createdAt: z.string(),
  }),
  table,
  partitionKey: "USER#{{userId}}",
  sortKey: "ORDER#{{orderId}}",
  indexes: {
    gsi1: {
      partitionKey: "{{status}}",
      sortKey: "{{createdAt}}",
    },
  },
});

// Create entity clients
const client = createClient({ adapter });
const users = client.entity(userEntity);
const orders = client.entity(orderEntity);

// Query all orders for a user
const userOrders = await orders.query({
  partitionKey: { userId: "123" },
  sortKeyCondition: { beginsWith: "ORDER#" },
});

// Query all pending orders across users via GSI
const pendingOrders = await orders.query({
  partitionKey: { status: "pending" },
  options: { indexName: "GSI1", scanIndexForward: false },
});

// Mix entity types in batch/transact operations
await client.transactWrite([
  {
    type: "put",
    entity: userEntity,
    data: { userId: "456", email: "bob@example.com", name: "Bob" },
  },
  {
    type: "put",
    entity: orderEntity,
    data: {
      userId: "456",
      orderId: "order-1",
      total: 99.99,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  },
]);
```

---

## SDK Adapters

### AWS SDK v3 with DocumentClient (recommended)

```typescript
import { createSDKv3DocAdapter } from "dynamo-schema/adapters/sdk-v3-doc";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const adapter = createSDKv3DocAdapter(ddbClient, {
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
});
```

### AWS SDK v3 with raw DynamoDB client

Use this when you need full control over AttributeValue marshalling. The library handles marshalling/unmarshalling automatically.

```typescript
import { createSDKv3Adapter } from "dynamo-schema/adapters/sdk-v3";
import {
  DynamoDBClient,
  PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand,
  QueryCommand, ScanCommand, BatchWriteItemCommand, BatchGetItemCommand,
  TransactWriteItemsCommand, TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({});

const adapter = createSDKv3Adapter(ddbClient, {
  PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand,
  QueryCommand, ScanCommand, BatchWriteItemCommand, BatchGetItemCommand,
  TransactWriteItemsCommand, TransactGetItemsCommand,
});
```

### AWS SDK v2 with DocumentClient

```typescript
import { createSDKv2DocAdapter } from "dynamo-schema/adapters/sdk-v2-doc";
import AWS from "aws-sdk";

const docClient = new AWS.DynamoDB.DocumentClient();
const adapter = createSDKv2DocAdapter(docClient);
```

### AWS SDK v2 with raw DynamoDB

```typescript
import { createSDKv2Adapter } from "dynamo-schema/adapters/sdk-v2";
import AWS from "aws-sdk";

const ddb = new AWS.DynamoDB();
const adapter = createSDKv2Adapter(ddb);
```

### Custom Adapters

You can implement the `SDKAdapter` interface to create adapters for testing or other DynamoDB-compatible services:

```typescript
import type { SDKAdapter } from "dynamo-schema";

const mockAdapter: SDKAdapter = {
  isRaw: false,
  putItem: async (input) => ({ attributes: undefined }),
  getItem: async (input) => ({ item: undefined }),
  deleteItem: async (input) => ({ attributes: undefined }),
  updateItem: async (input) => ({ attributes: undefined }),
  query: async (input) => ({ items: [], count: 0 }),
  scan: async (input) => ({ items: [], count: 0 }),
  batchWriteItem: async (requests) => ({ unprocessedItems: [] }),
  batchGetItem: async (requests) => ({ responses: {}, unprocessedKeys: [] }),
  transactWriteItems: async (items) => {},
  transactGetItems: async (items) => ({ items: [] }),
};
```

---

## Lifecycle Hooks

Entity lifecycle hooks let you attach cross-cutting behavior — audit logging, auto-timestamps, soft-delete, access control — to any entity **without wrapping every call manually**.

Hooks are defined in `defineEntity` and are **run by default** on every matching operation. Pass `skipHooks: true` in any operation's options to bypass all hooks for that specific call.

### Available hooks

| Hook | Operation | When it runs | Can abort? |
|------|-----------|--------------|-----------|
| `beforePut` | `put` | After schema validation, before key building | Yes — throw to abort |
| `beforeUpdate` | `update` | After builder runs, before TTL injection | Yes — throw to abort |
| `afterGet` | `get` | After item is fetched and unmarshalled | Yes — throw to abort |
| `beforeDelete` | `delete` | Before the DynamoDB call | Yes — throw to abort |

### Auto-inject timestamps

```typescript
import { defineEntity } from "dynamo-schema";

const UserEntity = defineEntity({
  name: "User",
  schema: UserSchema,
  table: UserTable,
  partitionKey: "USER#{{userId}}",
  sortKey: "PROFILE",
  hooks: {
    // Stamp updatedAt on every write
    beforePut: (item) => ({ ...item, updatedAt: Date.now() }),

    // Stamp updatedAt on every update expression
    beforeUpdate: (_key, actions) => ({
      ...actions,
      sets: [...actions.sets, { path: "updatedAt", value: Date.now() }],
    }),
  },
});
```

### Soft-delete with `beforeDelete`

```typescript
const OrderEntity = defineEntity({
  name: "Order",
  schema: OrderSchema,
  table: OrderTable,
  partitionKey: "ORDER#{{orderId}}",
  hooks: {
    // Prevent hard deletes — direct callers to a safer API
    beforeDelete: (_key) => {
      throw new Error("Orders cannot be deleted. Call cancelOrder() instead.");
    },
  },
});

// This will fail with type "hook" rather than hitting DynamoDB
const result = await orders.delete({ orderId: "ord-1" });
if (!result.success && result.error.type === "hook") {
  console.error(result.error.message);
}
```

### Transform results with `afterGet`

```typescript
const ProductEntity = defineEntity({
  name: "Product",
  schema: ProductSchema,
  table: ProductTable,
  partitionKey: "PRODUCT#{{productId}}",
  hooks: {
    // Provide a default when the item does not exist
    afterGet: (item) => item ?? { productId: "unknown", name: "Unknown Product", price: 0 },
  },
});
```

### Async hooks

Every hook can be synchronous or asynchronous — both are fully supported:

```typescript
const AuditedEntity = defineEntity({
  name: "AuditedItem",
  schema: ItemSchema,
  table: ItemTable,
  partitionKey: "ITEM#{{itemId}}",
  hooks: {
    beforeDelete: async (key) => {
      // Perform an async audit log write before allowing the delete
      await auditLog.record("delete", key);
    },
  },
});
```

### Skipping hooks for a single call

Pass `skipHooks: true` to any operation to bypass all hooks for that specific call:

```typescript
// Administrative bulk import — skip hooks for performance
await users.put(rawUser, { skipHooks: true });

// Bypass soft-delete protection for an admin hard-delete
await orders.delete({ orderId: "ord-1" }, { skipHooks: true });

// Skip afterGet transformation to get the raw stored item
const raw = await users.get({ userId: "u1" }, { skipHooks: true });
```

### Hook errors

When a hook throws, the operation is aborted and the error is returned as a `DynamoError` with `type: "hook"`. The original thrown value is preserved in `error.cause`.

```typescript
const result = await orders.delete({ orderId: "ord-1" });
if (!result.success) {
  if (result.error.type === "hook") {
    // A lifecycle hook aborted the operation
    console.error("Hook blocked operation:", result.error.message);
    console.error("Original error:", result.error.cause);
  }
}
```

---

## Error Handling

All operations return `Result<T, DynamoError>` instead of throwing exceptions.

```typescript
import type { Result, DynamoError } from "dynamo-schema";

const result = await users.put(userData);

if (result.success) {
  // result.data is the success value (void for put)
} else {
  // result.error is a DynamoError
  switch (result.error.type) {
    case "validation":
      // Schema validation failed
      console.error("Invalid data:", result.error.message);
      break;
    case "key":
      // Key building failed (missing template fields)
      console.error("Key error:", result.error.message);
      break;
    case "marshalling":
      // Marshalling/unmarshalling failed
      console.error("Marshalling error:", result.error.message);
      break;
    case "hook":
      // A lifecycle hook aborted the operation
      console.error("Hook error:", result.error.message);
      console.error("Cause:", result.error.cause);
      break;
    case "dynamo":
      // DynamoDB service error
      console.error("DynamoDB error:", result.error.message);
      console.error("Cause:", result.error.cause);
      break;
  }
}
```

**`DynamoError` type reference:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `"validation" \| "key" \| "marshalling" \| "hook" \| "dynamo"` | The category of error |
| `message` | `string` | Human-readable error message |
| `cause` | `unknown` | Optional underlying error |

**Result utilities:**

```typescript
import { ok, err, mapResult, flatMapResult } from "dynamo-schema";

// Map over a successful result
const mapped = mapResult(result, (user) => user.name);

// Chain operations that return Results
const chained = flatMapResult(result, (user) =>
  user.age >= 18 ? ok(user) : err(new Error("Must be 18+")),
);
```

---

## Validation

Runtime validation is **enabled by default**. Every `put` operation validates the data against the entity schema before writing to DynamoDB.

### Disabling validation

```typescript
// Disable for the entire client
const client = createClient({ adapter, validation: false });

// Or disable per operation
await users.put(data, { skipValidation: true });
```

### Table Validation

`validateTable()` compares your local `defineTable()` definition against the actual DynamoDB table in AWS. It calls `DescribeTable` through the SDK adapter and reports mismatches in key names, key types, indexes, and table status.

This is useful for catching drift between your code and your deployed table — for example during CI, deployment scripts, or application startup.

**Basic usage:**

```typescript
import { defineTable, validateTable } from "dynamo-schema";
import { createSDKv3DocAdapter } from "dynamo-schema/adapters/sdk-v3-doc";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
} from "@aws-sdk/lib-dynamodb";

// 1. Define your table locally
const table = defineTable({
  tableName: "MainTable",
  partitionKey: { name: "pk", definition: "pk" },
  sortKey: { name: "sk", definition: "sk" },
  indexes: {
    gsi1: {
      type: "GSI",
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", definition: "gsi1pk" },
      sortKey: { name: "gsi1sk", definition: "gsi1sk" },
    },
  },
});

// 2. Create the adapter
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const adapter = createSDKv3DocAdapter(ddbClient, {
  PutCommand, GetCommand, DeleteCommand, UpdateCommand,
  QueryCommand, ScanCommand, BatchWriteCommand, BatchGetCommand,
  TransactWriteCommand, TransactGetCommand,
});

// 3. Validate the table
const result = await validateTable(table, adapter);
```

**Handling the result:**

`validateTable` returns `Result<TableValidationResult, DynamoError>`. The `TableValidationResult` contains a `valid` boolean and an array of `issues`, each with a severity level.

```typescript
if (!result.success) {
  // The DescribeTable API call itself failed (e.g. table not found, permissions)
  console.error("Failed to describe table:", result.error.message);
} else if (!result.data.valid) {
  // The table exists but doesn't match the local definition
  console.log(`Table "${result.data.tableName}" has validation errors:`);

  for (const issue of result.data.issues) {
    // issue.severity: "error" | "warning" | "info"
    // issue.path:     location of the mismatch (e.g. "partitionKey", "indexes.gsi1.sortKey")
    // issue.message:  human-readable description
    // issue.expected: what the local definition expects (optional)
    // issue.actual:   what AWS returned (optional)
    console.log(`  [${issue.severity}] ${issue.path}: ${issue.message}`);
    if (issue.expected) console.log(`    expected: ${issue.expected}`);
    if (issue.actual)   console.log(`    actual:   ${issue.actual}`);
  }
} else {
  console.log(`Table "${result.data.tableName}" matches the local definition.`);
}
```

**What gets validated:**

| Check | Severity | Description |
|-------|----------|-------------|
| Table status | `warning` | Reports if the table status is not `"ACTIVE"` |
| Partition key name | `error` | Local `partitionKey.name` must match the AWS HASH key |
| Partition key type | `error` | If `partitionKey.type` is set locally, it must match AWS |
| Sort key presence | `error` | Both sides must agree on whether a sort key exists |
| Sort key name | `error` | Local `sortKey.name` must match the AWS RANGE key |
| Sort key type | `error` | If `sortKey.type` is set locally, it must match AWS |
| Index existence | `error` | Every locally defined index must exist in AWS |
| Index type | `error` | A local GSI must be a GSI in AWS (not an LSI), and vice versa |
| Index key names/types | `error` | Index partition and sort key names and types must match |
| GSI status | `warning` | Reports if a GSI status is not `"ACTIVE"` |
| Extra AWS indexes | `info` | Indexes in AWS that are not defined locally are reported |
| TTL attribute empty | `error` | `ttl.attributeName` must not be empty or whitespace |
| TTL conflicts with partition key | `error` | `ttl.attributeName` must not be the same as the partition key name |
| TTL conflicts with sort key | `error` | `ttl.attributeName` must not be the same as the sort key name |

**Using in CI or startup checks:**

```typescript
// Fail fast if the table schema has drifted
const assertTableValid = async (table: TableDefinition, adapter: SDKAdapter) => {
  const result = await validateTable(table, adapter);

  if (!result.success) {
    throw new Error(`Cannot validate table: ${result.error.message}`);
  }

  const errors = result.data.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    const summary = errors
      .map((e) => `  ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Table "${result.data.tableName}" schema mismatch:\n${summary}`,
    );
  }
};
```

**`TableValidationResult` type reference:**

| Property | Type | Description |
|----------|------|-------------|
| `tableName` | `string` | The table name that was validated |
| `tableStatus` | `string` | The AWS table status (e.g. `"ACTIVE"`) |
| `valid` | `boolean` | `true` if no `"error"` severity issues were found |
| `issues` | `readonly TableValidationIssue[]` | All issues found during validation |

**`TableValidationIssue` type reference:**

| Property | Type | Description |
|----------|------|-------------|
| `severity` | `"error" \| "warning" \| "info"` | How critical the issue is |
| `path` | `string` | Dot-separated path to the mismatched property |
| `message` | `string` | Human-readable description of the issue |
| `expected` | `string \| undefined` | What the local definition expects |
| `actual` | `string \| undefined` | What AWS returned |

### Using with different schema libraries

The library works with any [Standard Schema V1](https://standardschema.dev) compliant validation library.

**With Zod:**

```typescript
import { z } from "zod";

const schema = z.object({
  userId: z.string(),
  email: z.string().email(),
  tags: z.array(z.string()),
});
```

**With Valibot:**

```typescript
import * as v from "valibot";

const schema = v.object({
  userId: v.string(),
  email: v.pipe(v.string(), v.email()),
  tags: v.array(v.string()),
});
```

**With ArkType:**

```typescript
import { type } from "arktype";

const schema = type({
  userId: "string",
  email: "string",
  tags: "string[]",
});
```

---

## Marshalling

The library includes self-contained marshalling for converting between JavaScript values and DynamoDB's AttributeValue format. This is used automatically when you use a raw DynamoDB adapter (`isRaw: true`), but you can also use it directly:

```typescript
import { marshallItem, marshallValue, unmarshallItem, unmarshallValue } from "dynamo-schema";

// Marshall a JS object to DynamoDB format
const result = marshallItem({ name: "Alice", age: 30, active: true });
if (result.success) {
  console.log(result.data);
  // { name: { S: "Alice" }, age: { N: "30" }, active: { BOOL: true } }
}

// Unmarshall DynamoDB format back to JS
const item = unmarshallItem({
  name: { S: "Alice" },
  age: { N: "30" },
  active: { BOOL: true },
});
if (item.success) {
  console.log(item.data);
  // { name: "Alice", age: 30, active: true }
}
```

**Type mapping:**

| JavaScript Type | DynamoDB Type |
|----------------|---------------|
| `string` | `S` |
| `number` / `bigint` | `N` |
| `boolean` | `BOOL` |
| `null` / `undefined` | `NULL` |
| `Uint8Array` | `B` |
| `Set<string>` | `SS` |
| `Set<number>` | `NS` |
| `Set<Uint8Array>` | `BS` |
| `Array` | `L` |
| Plain object | `M` |

---

## API Reference

### Factory Functions

| Function | Description |
|----------|-------------|
| `defineTable(config)` | Creates an immutable table definition |
| `defineEntity(config)` | Creates an immutable entity definition with compile-time key validation |
| `createClient(config)` | Creates a DynamoDB client from an SDK adapter |
| `createUpdateBuilder<T>()` | Creates a standalone update expression builder |
| `validateTable(table, adapter)` | Validates a local table definition against the actual AWS table |

### DynamoClient Methods

| Method | Description |
|--------|-------------|
| `client.entity(entityDef)` | Returns a type-safe `EntityClient` for the entity |
| `client.batchWrite(requests, options?)` | Batch write with auto-chunking (25 items) |
| `client.batchGet(requests)` | Batch get with auto-chunking (100 items) |
| `client.transactWrite(requests, options?)` | Atomic write transaction (up to 100 items) |
| `client.transactGet(requests)` | Atomic get transaction (up to 100 items) |

### EntityClient Methods

| Method | Description |
|--------|-------------|
| `entity.put(data, options?)` | Write an item (validates against schema, auto-injects TTL if configured) |
| `entity.get(key, options?)` | Get an item by key |
| `entity.delete(key, options?)` | Delete an item by key |
| `entity.update(key, builderFn, options?)` | Update with type-safe expression builder (auto-refreshes TTL if configured) |
| `entity.query(input)` | Query by partition key with sort key conditions |
| `entity.scan(options?)` | Scan table or index |
| `entity.removeTtl(key)` | Remove the TTL attribute from an item so it never expires |

### Type Utilities

| Type | Description |
|------|-------------|
| `InferEntityType<E>` | Infer the TypeScript type from an entity definition |
| `EntityKeyInput<E>` | Infer the key input type for an entity |
| `EntityKeyFields<E>` | Union of field names in the entity's key templates |
| `ExtractTemplateFields<T>` | Extract field names from a template string type |
| `TtlConfig` | Table-level TTL config: `{ attributeName: string }` |
| `EntityTtlConfig` | Entity-level TTL behavior: `{ defaultTtlSeconds?, autoUpdateTtlSeconds? }` |
| `EntityHooks<T>` | Lifecycle hooks for an entity: `{ beforePut?, beforeUpdate?, afterGet?, beforeDelete? }` |
| `Result<T, E>` | Success/failure discriminated union |
| `DynamoError` | Error type with `type`, `message`, and `cause` |

---

## License

ISC

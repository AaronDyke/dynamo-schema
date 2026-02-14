# Claude Development Guidelines

## Project Overview

This is a DynamoDB schema validation and modeling library for TypeScript. The library provides type-safe schema definitions, validation, and modeling capabilities for working with AWS DynamoDB.

## Code Style & Conventions

### Naming Conventions
- **Variables & Functions**: `camelCase`
- **Types & Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config objects
- **Files**: `kebab-case.ts` for regular files, `PascalCase.ts` for type-only files (optional)

### TypeScript Patterns
- **Prefer functional patterns** over object-oriented
- Use pure functions wherever possible
- Prefer composition over inheritance
- Use `const` for function declarations: `const functionName = () => {}`
- Avoid classes unless absolutely necessary (prefer functions and closures)

### Type Safety
- **Strict null checks are mandatory**
- Always handle `null` and `undefined` explicitly
- Use discriminated unions for variant types
- Prefer `unknown` over `any`, avoid `any` entirely if possible
- Use type narrowing with type guards
- Leverage TypeScript's strict mode features (already configured in tsconfig.json)

### Error Handling
- Use Result/Either types for operations that can fail (avoid throwing exceptions in library code)
- Return explicit error types: `Result<T, E>` or `{ success: boolean; data?: T; error?: E }`
- Document error conditions in JSDoc comments
- For critical failures only, use typed error classes
- Never swallow errors silently

Example:
```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

const parseSchema = (input: unknown): Result<Schema, ValidationError> => {
  // Implementation
};
```

## Architecture & Patterns

### Project Structure
```
src/
├── core/           # Core schema types and utilities
├── validation/     # Validation logic
├── modeling/       # DynamoDB modeling utilities
├── types/          # Shared TypeScript types
└── utils/          # Helper functions
```

### Functional Patterns
- **Immutability**: Never mutate data, always return new objects
- **Pure Functions**: Functions should not have side effects
- **Higher-Order Functions**: Use map, filter, reduce over loops
- **Function Composition**: Build complex logic from simple functions
- **Currying**: Use for reusable, partially applied functions

### DynamoDB Specific
- Model single-table design patterns
- Support for composite keys (partition key + sort key)
- GSI (Global Secondary Index) and LSI (Local Secondary Index) aware
- Type-safe attribute definitions matching DynamoDB types

## Code Quality

### Documentation
- Use JSDoc comments for all public APIs
- Include `@param`, `@returns`, and `@throws` (if applicable)
- Add `@example` for complex functions
- Document edge cases and assumptions

### Testing
- Write tests for all public APIs
- Use property-based testing for validation logic
- Test error cases explicitly
- Aim for high coverage on core functionality

### Performance
- Avoid unnecessary object allocations
- Use lazy evaluation where appropriate
- Consider memoization for expensive pure functions
- Profile before optimizing

## Development Workflow

### Building
```bash
npm run build      # Compile TypeScript
```

### Testing
```bash
npm test          # Run tests
npm run test:watch # Watch mode
```

### Type Checking
```bash
npm run type-check # Run tsc without emitting
```

## Dependencies
- Minimize external dependencies
- Prefer well-maintained, typed libraries
- Document why each dependency is necessary
- Consider bundle size impact

## Common Patterns

### Schema Definition
Schemas should be defined using builder patterns or factory functions:
```typescript
const schema = createSchema({
  tableName: 'Users',
  partitionKey: 'userId',
  attributes: {
    userId: stringAttribute(),
    email: stringAttribute(),
    createdAt: numberAttribute(),
  }
});
```

### Validation
Use composable validators:
```typescript
const validateEmail = (value: string): Result<string, ValidationError> => {
  // Implementation
};
```

### Type Inference
Leverage TypeScript's type inference to derive types from schemas:
```typescript
type User = InferSchemaType<typeof schema>;
```

## What to Avoid
- Avoid mutation of input parameters
- Avoid classes unless modeling complex stateful entities
- Avoid `any` type - use `unknown` and narrow types
- Avoid throwing errors in library code - return Result types
- Avoid deep nesting - extract to named functions
- Avoid clever code - prefer clear and explicit

## Additional Notes
- This library should be runtime-agnostic (works in Node.js and browsers with AWS SDK)
- Prioritize developer experience with great TypeScript inference
- Keep the API surface small and composable
- Follow semantic versioning strictly

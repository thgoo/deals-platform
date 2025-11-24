# Hono Boilerplate

A boilerplate for building RESTful APIs with **Hono**, **Drizzle ORM**, **Zod**, and **Bun**. Includes authentication with rolling sessions, structured logging, and dependency injection.

## Key Technologies

*   **Hono**: Fast, lightweight web framework built on Web Standards
*   **Drizzle ORM**: TypeScript-first ORM for relational databases
*   **Zod**: TypeScript-first schema validation
*   **Bun**: Fast JavaScript runtime and package manager
*   **ESLint**: Code linting with strict TypeScript rules
*   **Oslo.js**: Cryptographic utilities for secure session management

## What's Included

- Authentication (register, login, session management)
- Logging interface (console by default, easy to swap)
- Error handling (sanitized in production, detailed in dev)
- Database with Drizzle ORM + migrations
- Input validation with Zod
- Dependency injection for services
- Tests + ESLint + CI/CD

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Configure Environment

Create a `.env` file based on `.env.example`:

```env
NODE_ENV=development
PORT=8000
DATABASE_URL="mysql://user:password@localhost:3306/hono_db"
SESSION_SECRET="your_very_long_and_secure_session_secret_here_min_32_chars"
```

**Environment Variables:**
- `NODE_ENV`: Application environment (`development`, `production`, `test`)
- `PORT`: Server port (default: `8000`)
- `DATABASE_URL`: MySQL connection string
- `SESSION_SECRET`: Secret for session signing (minimum 32 characters)

### 3. Setup Database

Generate and apply migrations:

```sh
bun drizzle-kit generate:mysql
bun drizzle-kit migrate
```

### 4. Start Development Server

```sh
bun run dev
```

Access the API at `http://localhost:8000`

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot-reload |
| `bun run lint` | Check code quality with ESLint |
| `bun test` | Run unit tests |

## Project Structure

```
src/
├── auth/                 # Authentication module
│   ├── middleware/       # Route protection (isAuthorized, isGuest)
│   ├── services/         # Business logic (user, session, password)
│   ├── auth.ts           # Auth routes
│   ├── schemas.ts        # Zod validation schemas
│   └── types.ts          # Auth type definitions
├── constants/            # Application constants
│   ├── http.ts           # HTTP status codes
│   └── session.ts        # Session configuration (duration, renewal)
├── db/                   # Database layer
│   ├── schemas/          # Drizzle table definitions
│   └── index.ts          # Database connection
├── services/             # Shared services
│   └── logger/           # Logging abstraction
│       ├── types.ts      # Logger interface
│       ├── console-logger.ts  # Default implementation
│       └── index.ts      # Exports
├── types/                # Global TypeScript types
│   └── hono.d.ts         # Hono context augmentation
├── utils/                # Utility functions
│   └── errors.ts         # Custom error classes
├── config.ts             # Environment validation with Zod
└── index.ts              # Application entry point
```

## Authentication

### Strategy: Rolling Sessions

This boilerplate uses **rolling sessions** for simplicity and excellent UX:

- **Session Duration**: 30 days
- **Auto-Renewal**: Sessions renew automatically 7 days before expiration
- **Active Users**: Never logged out while using the app
- **Security**: HttpOnly + Secure cookies prevent XSS/CSRF attacks

**Why Rolling Sessions?**

- Simple implementation (1 token vs 2)
- Great user experience (no surprise logouts)
- Sufficient security for most web applications
- Industry standard (used by GitHub, Gmail, Facebook)

**When to Consider Refresh Tokens Instead:**

- Public API with granular scopes/permissions
- Mobile apps requiring offline access
- Microservices with stateless JWT validation
- Extreme scale (millions of requests/second)

For most web applications, rolling sessions provide better UX with sufficient security.

### Available Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | Guest | Create new account |
| `POST` | `/api/auth/login` | Guest | Login with credentials |
| `GET` | `/api/auth/me` | Required | Get current user |
| `POST` | `/api/auth/logout` | Required | End session |

### Middleware

**`isAuthorized`**
- Validates session token from cookie
- Injects `user`, `session`, and `token` into context
- Automatically removes password fields from responses
- Returns `401 Unauthorized` if session invalid

**`isGuest`**
- Ensures user is NOT authenticated
- Returns `403 Forbidden` if user is logged in
- Used for login/register routes

## Logging

### Default Implementation (Console)

The boilerplate includes a simple console logger that:
- Outputs structured JSON logs
- Automatically disabled in test environment
- Differentiates error vs info logs
- Includes timestamps and metadata

### Custom Logger Implementation

To use a different logging provider (Sentry, Pino, Datadog), implement the `Logger` interface:

```typescript
// src/services/logger/sentry-logger.ts
import * as Sentry from '@sentry/bun';
import type { Logger } from './types';

export class SentryLogger implements Logger {
  info(message: string, meta?: Record<string, unknown>) {
    Sentry.captureMessage(message, { level: 'info', extra: meta });
  }

  error(message: string, meta?: Record<string, unknown>) {
    Sentry.captureException(new Error(message), { extra: meta });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    Sentry.captureMessage(message, { level: 'warning', extra: meta });
  }

  debug(message: string, meta?: Record<string, unknown>) {
    Sentry.captureMessage(message, { level: 'debug', extra: meta });
  }
}
```

Then inject it in `src/index.ts`:

```typescript
import { SentryLogger } from '~/services/logger/sentry-logger';

const app = createApp({
  appLogger: new SentryLogger(),
});
```

**Popular Options:**
- [Pino](https://github.com/pinojs/pino) - Fast structured logging
- [Sentry](https://sentry.io) - Error tracking with context
- [Axiom](https://axiom.co) - Cloud-native observability
- [BetterStack](https://betterstack.com) - Log management

## Error Handling

### Global Error Handler

All errors are caught by the global handler in `src/index.ts`:

**1. `HttpError` (Business Logic Errors)**
```typescript
throw new HttpError(400, 'Email already in use');
// → { "message": "Email already in use" } (400 Bad Request)
```

**2. `HTTPException` (Hono Framework Errors)**
- CSRF validation failures
- Body parsing errors
- Automatically handled with appropriate status codes

**3. Unhandled Errors (500)**
- **Development**: Returns actual error message for debugging
- **Production**: Returns generic "Internal Server Error"
- **Always**: Logs full error with stack trace and request context

### Custom Error Class

```typescript
import { HttpError } from '~/utils/errors';

// In your service/route
if (!user) {
  throw new HttpError(404, 'User not found');
}
```

## Database (Drizzle ORM)

### Schema Definition

Define tables in `src/db/schemas/`:

```typescript
// src/db/schemas/products.ts
import { bigint, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

export const productsTable = mysqlTable('products', {
  id: bigint({ mode: 'number', unsigned: true })
    .autoincrement()
    .primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  price: bigint({ mode: 'number', unsigned: true }).notNull(),
});

export type Product = InferSelectModel<typeof productsTable>;
export type NewProduct = typeof productsTable.$inferInsert;
```

### Migrations

```sh
# Generate migration after schema changes
bun drizzle-kit generate:mysql

# Apply pending migrations
bun drizzle-kit migrate
```

## How to Extend

### Add a New Module

1. **Create module structure:**
```
src/products/
├── services/
│   └── product-service.ts
├── products.ts           # Routes
└── schemas.ts            # Zod validation
```

2. **Define service:**
```typescript
// src/products/services/product-service.ts
import db from '~/db';
import { productsTable } from '~/db/schemas/products';

export class ProductService {
  async getAllProducts() {
    return await db.select().from(productsTable);
  }
}

export default ProductService;
```

3. **Create routes:**
```typescript
// src/products/products.ts
import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const productService = c.get('productService');
  const products = await productService.getAllProducts();
  return c.json(products);
});

export default app;
```

4. **Register in main app:**
```typescript
// src/index.ts
import products from '~/products/products';
import ProductService from '~/products/services/product-service';

export function createApp({
  // ... existing services
  productService = new ProductService(),
} = {}) {
  // ... existing setup

  app.use('*', async (c, next) => {
    // ... existing services
    c.set('productService', productService);
    await next();
  });

  app.route('/api/products', products);
}
```

5. **Add to type definitions:**
```typescript
// src/types/hono.d.ts
import type ProductService from '~/products/services/product-service';

declare module 'hono' {
  interface ContextVariableMap {
    // ... existing services
    productService: ProductService;
  }
}
```

## Testing

Run tests with:

```sh
bun test
```

### Mock Services in Tests

```typescript
import { describe, expect, it, mock } from 'bun:test';
import { createApp } from '~/index';

describe('Products API', () => {
  it('should return all products', async () => {
    const mockProductService = {
      getAllProducts: mock(() => Promise.resolve([
        { id: 1, name: 'Product 1', price: 1000 }
      ])),
    };

    const app = createApp({ productService: mockProductService });
    const res = await app.request('/api/products');

    expect(res.status).toBe(200);
    expect(mockProductService.getAllProducts).toHaveBeenCalled();
  });
});
```

## Deployment

### Environment Variables

Ensure these are set in production:

```env
NODE_ENV=production
PORT=8000
DATABASE_URL="mysql://user:password@prod-host:3306/db"
SESSION_SECRET="your-production-secret-min-32-chars"
```

### Production Considerations

1. **Database Connection Pooling**: Configure in `src/db/index.ts`
2. **Session Cleanup**: Add cron job to delete expired sessions
3. **Rate Limiting**: Add middleware like `hono-rate-limiter`
4. **HTTPS**: Always use HTTPS (Secure cookies enabled automatically)
5. **Logging**: Replace ConsoleLogger with production logger (Sentry, Pino)

## License

MIT

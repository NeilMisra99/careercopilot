# Worker Proxy API Routes

This directory contains organized proxy routes that forward requests to the Cloudflare Worker backend. This structure provides better organization and clearer endpoint mapping compared to the previous generic proxy approach.

## Structure

```
worker_proxy/
├── _lib/
│   └── worker-client.ts          # Shared utilities for worker communication
├── applications/
│   ├── route.ts                  # GET, POST /api/applications
│   └── [id]/
│       └── route.ts              # PATCH /api/applications/:id
├── gmail/
│   ├── messages/
│   │   └── route.ts              # GET /api/gmail/messages
│   ├── sync-status/
│   │   └── route.ts              # GET /api/gmail/sync-status
│   └── user-info/
│       └── route.ts              # GET /api/gmail/user-info
├── job-boards/
│   └── scrape/
│       └── route.ts              # GET /api/job-boards/scrape
├── suggestions/
│   ├── route.ts                  # GET /api/suggestions, POST /api/suggestions/bulk-action
│   └── [id]/
│       └── route.ts              # PATCH /api/suggestions/:id
└── sync/
    └── gmail/
        └── route.ts              # POST /api/gmail/sync-now
```

## Benefits

1. **Clear endpoint mapping**: Each proxy route maps directly to its worker endpoint
2. **Type safety**: Better TypeScript support with explicit route handlers
3. **Maintainability**: Easier to find and modify specific endpoint logic
4. **Authentication**: Centralized auth handling in the shared worker-client utility
5. **Error handling**: Consistent error handling across all proxy routes

## Usage

### Frontend (Client Components)

```typescript
// Instead of the old generic proxy approach:
const response = await fetch("/api/worker-proxy", {
  method: "POST",
  body: JSON.stringify({
    endpoint: "/api/applications",
    method: "GET",
  }),
});

// Use the new specific proxy routes:
const response = await fetch("/api/worker_proxy/applications");
```

### Server Actions

```typescript
// For server actions, you can call the proxy routes directly:
const response = await fetch(`${baseUrl}/api/worker_proxy/applications`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(applicationData),
});
```

## Worker Client Utility

The `_lib/worker-client.ts` provides:

- **makeWorkerRequest()**: Main function for proxying requests to worker
- **getQueryParams()**: Helper for extracting URL query parameters
- **getRequestBody()**: Helper for safely extracting request body
- **Authentication**: Automatic Supabase session handling
- **Error handling**: Consistent error responses

## Migration Notes

If you're updating code that used the old `/api/worker-proxy` route:

1. Replace generic proxy calls with specific proxy routes
2. Use GET requests with query parameters instead of POST with endpoint in body
3. Update error handling to expect consistent error response format
4. Remove manual authentication headers (handled automatically)

## Authentication

All proxy routes automatically:

1. Extract the user session from Supabase
2. Forward the session token to the worker
3. Return 401 if user is not authenticated
4. Handle token refresh if needed

The worker receives the user's session token in the `Authorization` header and can authenticate the user using Supabase.

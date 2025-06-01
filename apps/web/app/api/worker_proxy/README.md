# Worker Proxy API Routes

This directory contains Next.js API routes that proxy requests to the Cloudflare Worker backend. This pattern allows the Next.js frontend to make authenticated requests to the worker while maintaining proper session handling.

## Architecture

```
Next.js App (Frontend) → API Route Proxy → Cloudflare Worker (Backend)
```

The proxy routes handle:

- Session management and authentication
- Request/response transformation
- Error handling

## Route Structure

```
worker_proxy/
├── _lib/
│   └── worker-client.ts             # Common worker request logic
├── applications/
│   ├── route.ts                     # GET /api/applications, POST /api/applications
│   └── [id]/
│       └── route.ts                 # POST /api/applications/:id/review
├── gmail/
│   ├── messages/
│   │   └── route.ts                 # GET /api/gmail/messages
│   ├── user-info/
│   │   └── route.ts                 # GET /api/gmail/user-info
│   ├── failed-emails/
│   │   └── route.ts                 # GET /api/gmail/failed-emails
│   ├── process-failed-email/
│   │   └── route.ts                 # POST /api/gmail/process-failed-email
│   └── sync-status/
│       └── route.ts                 # GET /api/gmail/sync-status
├── job-boards/
│   └── scrape/
│       └── route.ts                 # GET /api/job-boards/scrape
└── sync/
    └── gmail/
        └── route.ts                 # POST /api/sync/gmail
```

## Usage

Frontend components can call these routes directly:

```typescript
// Get applications
const response = await fetch("/api/worker_proxy/applications");

// Review pending application
const response = await fetch(`/api/worker_proxy/applications/${id}/review`, {
  method: "POST",
  body: JSON.stringify({ action: "approve" }),
});
```

## Authentication

All routes automatically forward Supabase session cookies to the worker for authentication.

# Trackflow Workers

This directory contains the Cloudflare Workers that power the Trackflow application's backend services.

## Development

### Starting the Worker

```bash
npm run dev
```

This starts the worker on `http://localhost:8787` with hot reloading.

### Triggering Email Sync (Development)

During development, you can manually trigger the email sync process in several ways:

#### Option 1: npm script (simple)

```bash
npm run trigger-cron
```

#### Option 2: Enhanced script with logging

```bash
npm run sync
# or directly:
./scripts/trigger-sync.sh
```

#### Option 3: Using the development API endpoint

```bash
./scripts/trigger-sync.sh --api
# or manually:
curl -X POST "http://localhost:8787/api/dev/trigger-sync"
```

#### Option 4: Manual curl (basic)

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

### What happens during sync?

1. **Gmail Integration Scan**: Worker checks for active Gmail integrations that need syncing
2. **Email Fetching**: Retrieves new emails from Gmail API using stored tokens
3. **Queue Processing**: Emails are queued for AI processing
4. **AI Classification**: Determines if emails are job-application related
5. **Data Extraction**: Extracts application details from relevant emails
6. **Database Updates**: Creates or updates application records

### Environment Variables

Make sure your `.dev.vars` file includes:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key
WORKER_GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/gmail/callback
APP_BASE_URL=http://localhost:3000
TOKEN_BACKEND=kv
```

### Troubleshooting

- **Sync not working?** Check that Gmail integrations exist in the database
- **No emails processed?** Verify tokens are valid and not expired
- **Queue issues?** Check that the `EMAIL_PARSE_QUEUE` binding is configured
- **Database errors?** Ensure Hyperdrive connection is working

## Deployment

```bash
npm run deploy
```

## Features

- **Email Sync**: Automated Gmail integration with OAuth2
- **AI Processing**: Email classification and data extraction
- **Queue System**: Reliable message processing with retries
- **Rate Limiting**: Prevents API abuse and respects quotas
- **Token Management**: Secure token storage and refresh

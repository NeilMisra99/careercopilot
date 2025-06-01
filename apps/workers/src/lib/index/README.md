# Index Module - Refactored Worker API

This module contains the refactored main worker API that was previously in a monolithic `index.ts` file. The code has been broken down into focused, modular components for better maintainability and organization.

## 📁 Module Structure

```
lib/index/
├── types.ts              # Type definitions and interfaces
├── middleware/
│   └── setup.ts          # Middleware configuration functions
├── routes/
│   ├── gmail.ts          # Gmail OAuth and API routes
│   ├── applications.ts   # Application management routes
│   ├── scraping.ts       # Web scraping routes
│   └── debug.ts          # Debug and development routes
├── auth/
│   └── utils.ts          # Authentication utilities
└── README.md             # This documentation
```

## 🔧 Core Components

### Types (`types.ts`)

- **Main Environment Interface**: Complete worker environment with bindings and variables
- **Google API Types**: OAuth responses, user info, token data
- **Application Types**: CRUD operations, review actions, status validation
- **Gmail Types**: Message metadata, sync status, integration data
- **Scraping Types**: Job board scraping results and configurations

### Middleware (`middleware/setup.ts`)

- **CORS Configuration**: Cross-origin request handling for Next.js app
- **Pretty JSON**: Response formatting
- **Supabase Auth**: User authentication middleware
- **Hyperdrive Database**: PostgreSQL connection setup
- **Token Repository**: Multi-backend token storage (KV/Supabase)

### Route Modules

#### Gmail Routes (`routes/gmail.ts`)

- **OAuth Flow**: Initiate and handle Gmail OAuth callbacks
- **User Info**: Fetch authenticated user information
- **Messages**: List and retrieve Gmail messages
- **Sync Management**: Manual sync triggers and status monitoring
- **Failed Emails**: Handle and retry failed email processing

#### Application Routes (`routes/applications.ts`)

- **CRUD Operations**: Create, read, update applications
- **Review System**: Approve/reject AI-suggested applications
- **Source Tracking**: Email source history for applications
- **Status Management**: Application lifecycle tracking

#### Scraping Routes (`routes/scraping.ts`)

- **Smart URL Scraping**: Extract job details from URLs
- **AI Enhancement**: Intelligent content extraction
- **Caching**: Performance optimization for repeated scrapes
- **Browser Management**: Puppeteer integration

#### Debug Routes (`routes/debug.ts`)

- **Encryption Testing**: Verify token encryption/decryption
- **Manual Sync**: Development-only sync triggers
- **Health Checks**: System status monitoring
- **User Info**: Current user details

### Authentication (`auth/utils.ts`)

- **Token Management**: OAuth token refresh and validation
- **State Handling**: CSRF protection for OAuth flows
- **User Validation**: Authentication checks and user info retrieval
- **Multi-backend Support**: KV and Supabase token storage

## 🚀 Main Application (`index.ts`)

The refactored main file is now clean and focused:

```typescript
// Clean imports from modular structure
import { setupCors, setupSupabaseAuth, ... } from './lib/index/middleware/setup';
import { initiateGmailOAuth, ... } from './lib/index/routes/gmail';

// Middleware setup
app.use('/api/*', setupCors());
app.use('/api/*', setupSupabaseAuth());

// Route registration
app.get('/api/auth/gmail/initiate', initiateGmailOAuth);
app.get('/api/applications', getApplications);

// Worker handlers
export default {
  fetch: app.fetch,
  queue: handleEmailParseQueueBatch,
  scheduled: emailFetcher.scheduled,
};
```

## 🔄 Migration Benefits

### Before Refactoring

- **1,609 lines** in single file
- **Mixed responsibilities** (auth, routes, middleware, types)
- **Difficult testing** (monolithic structure)
- **Hard maintenance** (everything in one place)
- **Poor reusability** (tightly coupled code)

### After Refactoring

- **~100 lines** in main file (94% reduction)
- **Single responsibility** per module
- **Easy testing** (isolated components)
- **Simple maintenance** (focused modules)
- **High reusability** (modular exports)

## 📋 API Endpoints

### Authentication

- `GET /api/auth/gmail/initiate` - Start Gmail OAuth
- `GET /api/auth/gmail/callback` - Handle OAuth callback

### Gmail Integration

- `GET /api/gmail/user-info` - Get user information
- `GET /api/gmail/messages` - List Gmail messages
- `POST /api/gmail/sync-now` - Trigger manual sync
- `GET /api/gmail/sync-status` - Check sync status
- `GET /api/gmail/failed-emails` - Get failed emails
- `POST /api/gmail/process-failed-email` - Retry failed email

### Application Management

- `GET /api/applications` - List applications
- `POST /api/applications` - Create application
- `POST /api/applications/:id` - Update application
- `GET /api/applications/pending-review` - Get pending reviews
- `POST /api/applications/:id/review` - Review application
- `GET /api/applications/:id/sources` - Get email sources

### Utilities

- `GET /api/job-boards/scrape` - Scrape job URLs
- `GET /api/health` - Health check
- `GET /api/me` - Current user info

### Debug (Development Only)

- `GET /api/debug/test-encryption` - Test encryption
- `POST /api/dev/trigger-sync` - Manual sync trigger

## 🔒 Security Features

- **CSRF Protection**: OAuth state validation
- **Rate Limiting**: Sync request throttling
- **Environment Checks**: Debug endpoints restricted to development
- **Token Encryption**: Secure storage of OAuth tokens
- **User Authorization**: All routes require authentication

## 🧪 Testing Strategy

Each module can be tested independently:

```typescript
// Example: Testing Gmail routes
import { initiateGmailOAuth } from './routes/gmail';
import { createMockContext } from './test-utils';

test('Gmail OAuth initiation', async () => {
	const mockContext = createMockContext();
	const response = await initiateGmailOAuth(mockContext);
	expect(response.status).toBe(200);
});
```

## 🔧 Configuration

Environment variables required:

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `TOKEN_ENCRYPTION_KEY` - Token encryption key
- `HYPERDRIVE_SUPABASE` - Database connection
- `EMAIL_PARSE_QUEUE` - Queue binding
- `TOKEN_BACKEND` - Storage backend (kv/supabase)

## 🚀 Performance Optimizations

- **Modular Loading**: Only load required modules
- **Tree Shaking**: Unused code elimination
- **Concurrent Processing**: Parallel API calls
- **Caching**: Scraping result caching
- **Connection Pooling**: Database optimization

## 🔮 Future Enhancements

- **Route Versioning**: API version management
- **Request Validation**: Schema-based validation
- **Metrics Collection**: Performance monitoring
- **Circuit Breakers**: Fault tolerance
- **Batch Operations**: Bulk API operations

## 📝 Migration Notes

### Breaking Changes

- **None**: 100% backward compatibility maintained
- **Same exports**: All original functions preserved
- **Same behavior**: Identical functionality

### Internal Changes

- **File organization**: Code split into modules
- **Import paths**: Internal restructuring
- **Type definitions**: Better organization
- **Error handling**: Improved consistency

This refactoring maintains complete functional compatibility while dramatically improving code organization, maintainability, and developer experience.

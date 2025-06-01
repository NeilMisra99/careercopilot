# Email Fetcher Module

This module contains the refactored email fetcher functionality that was previously in a single large file. The code has been organized into focused, modular components for better maintainability and testing.

## Structure

```
lib/email-fetcher/
├── index.ts              # Main exports for the module
├── types.ts              # Type definitions and constants
├── gmail-api.ts          # Gmail API utilities (base64 decoding, content extraction)
├── token-manager.ts      # OAuth token management and refresh logic
├── ai-processor.ts       # AI classification and extraction processing
├── sync-engine.ts        # Core Gmail synchronization logic
└── README.md            # This documentation
```

## Modules

### `types.ts`

- **Purpose**: Centralized type definitions and constants
- **Contains**:
  - Gmail API interfaces (`GmailApiMessage`, `GmailApiMessagePayloadPart`)
  - Environment and database interfaces
  - Error and sync types
  - Configuration constants

### `gmail-api.ts`

- **Purpose**: Gmail API interaction utilities
- **Functions**:
  - `base64UrlDecode()` - Decode Gmail's base64url encoding
  - `fetchAttachment()` - Retrieve email attachments
  - `extractBodyParts()` - Extract text/HTML from email payload
  - `getEmailHeader()` - Helper to get email headers

### `token-manager.ts`

- **Purpose**: OAuth token lifecycle management
- **Functions**:
  - `getValidGmailAccessToken()` - Get/refresh Gmail access tokens
- **Features**:
  - Automatic token refresh
  - Error handling for invalid tokens
  - Support for multiple token storage backends

### `ai-processor.ts`

- **Purpose**: AI-powered email analysis
- **Functions**:
  - `processEmailWithAI()` - Classify and extract data from emails
- **Features**:
  - Full email content processing (no truncation)
  - Job application classification
  - Data extraction for job-related emails

### `sync-engine.ts`

- **Purpose**: Core Gmail synchronization logic
- **Functions**:
  - `syncGmailIntegration()` - Main sync function for Gmail accounts
- **Features**:
  - Initial and incremental sync support
  - Real-time progress tracking
  - Batch processing for efficiency
  - Error recovery and status management

### `index.ts`

- **Purpose**: Module exports and public API
- **Exports**: All main functions, types, and constants

## Key Features

1. **Modular Design**: Each module has a single responsibility
2. **Clean Imports**: Proper separation of type and value imports
3. **Error Handling**: Comprehensive error handling at each layer
4. **Logging**: Detailed logging with module-specific prefixes
5. **Type Safety**: Full TypeScript type coverage
6. **Reusability**: Functions can be imported individually as needed

## Usage

```typescript
// Import the main sync function
import { syncGmailIntegration } from './lib/email-fetcher';

// Import specific utilities
import { extractBodyParts, base64UrlDecode } from './lib/email-fetcher/gmail-api';

// Import types
import type { ScheduledWorkerEnv, SyncOptions } from './lib/email-fetcher/types';
```

## Migration Notes

The refactored code maintains 100% functional compatibility with the original `email-fetcher.ts`. All existing functionality has been preserved while improving:

- **Maintainability**: Easier to modify individual components
- **Testing**: Each module can be unit tested in isolation
- **Readability**: Cleaner, more focused code files
- **Reusability**: Functions can be reused across different contexts
- **Documentation**: Better inline documentation and type definitions

No breaking changes have been introduced - all existing imports and function signatures remain the same.

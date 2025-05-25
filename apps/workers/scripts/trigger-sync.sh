#!/bin/bash

echo "🕒 Triggering scheduled email sync..."
echo "📧 This will scan Gmail integrations and queue emails for processing"
echo ""

# Check if user wants to use the API endpoint instead
if [ "$1" = "--api" ]; then
    echo "🔧 Using development API endpoint..."
    response=$(curl -s -X POST -w "\n%{http_code}" "http://localhost:8787/api/dev/trigger-sync")
else
    echo "🔧 Using scheduled handler endpoint..."
    response=$(curl -s -w "\n%{http_code}" "http://localhost:8787/cdn-cgi/handler/scheduled")
fi

# Extract the HTTP code (last line)
http_code=$(echo "$response" | tail -n1)

# Extract the response body (all but last line)
body=$(echo "$response" | head -n -1)

echo "📊 HTTP Status: $http_code"

if [ "$http_code" = "200" ]; then
    echo "✅ Sync triggered successfully!"
    echo ""
    echo "🔍 What happens next:"
    echo "   1. Worker scans for Gmail integrations that need syncing"
    echo "   2. Fetches new emails from Gmail API"
    echo "   3. Queues emails for AI processing"
    echo "   4. Creates/updates applications in database"
    echo ""
    echo "💡 Tip: Check the worker logs to see the sync progress"
else
    echo "❌ Failed to trigger sync"
    if [ ! -z "$body" ]; then
        echo "Response: $body"
    fi
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Make sure the worker is running (npm run dev)"
    echo "   - Check that you're running this from the workers directory"
    echo "   - Verify the worker is accessible at http://localhost:8787"
    echo ""
    echo "📝 Usage options:"
    echo "   ./scripts/trigger-sync.sh          # Use scheduled handler (default)"
    echo "   ./scripts/trigger-sync.sh --api    # Use development API endpoint"
fi

echo "" 
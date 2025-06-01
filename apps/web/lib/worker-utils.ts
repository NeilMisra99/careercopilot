/**
 * Worker utilities that can be used in server components
 */

// Get the Worker URL from environment (server-side only)
export function getWorkerUrl(): string {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL
  if (!workerUrl) {
    // Fallback to localhost for development
    return "http://localhost:8787"
  }
  return workerUrl
}

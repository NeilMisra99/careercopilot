import { revalidatePath, revalidateTag } from "next/cache"

// Cache tag definitions
export const CACHE_TAGS = {
  // Data-specific tags
  APPLICATIONS_DATA: "applications-data",
  APPLICATIONS_BOARD: "applications-board",
  PENDING_APPLICATIONS: "pending-applications",
  GMAIL_MESSAGES: "gmail-messages",
  FAILED_EMAILS: "failed-emails",

  // Page-level tags
  DASHBOARD_DATA: "dashboard-data",
  BOARD_DATA: "board-data",
} as const

export const CACHE_PATHS = {
  DASHBOARD: "/dashboard",
  BOARD: "/dashboard/board",
  ADD_APPLICATION: "/dashboard/add-application",
} as const

// Cache configuration presets
export const CACHE_CONFIG = {
  SHORT: {
    revalidate: 120, // 2 minutes
  },
  MEDIUM: {
    revalidate: 180, // 3 minutes
  },
  LONG: {
    revalidate: 300, // 5 minutes
  },
} as const

// Cache revalidation utilities
export function revalidateApplicationData() {
  revalidateTag(CACHE_TAGS.APPLICATIONS_DATA)
  revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA)
  revalidateTag(CACHE_TAGS.BOARD_DATA)
}

export function revalidatePendingApplications() {
  revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA)
}

export function revalidateGmailData() {
  revalidateTag(CACHE_TAGS.GMAIL_MESSAGES)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA)
}

export function revalidateFailedEmails() {
  revalidateTag(CACHE_TAGS.FAILED_EMAILS)
  revalidateTag(CACHE_TAGS.BOARD_DATA)
}

export function revalidateAllApplicationData() {
  revalidateTag(CACHE_TAGS.APPLICATIONS_DATA)
  revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD)
  revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS)
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA)
  revalidateTag(CACHE_TAGS.BOARD_DATA)
}

export function revalidateApplicationPages() {
  revalidatePath(CACHE_PATHS.DASHBOARD)
  revalidatePath(CACHE_PATHS.BOARD)
  revalidatePath(CACHE_PATHS.ADD_APPLICATION)
}

export function revalidateAllCacheAndPages() {
  revalidateAllApplicationData()
  revalidateGmailData()
  revalidateFailedEmails()
  revalidateApplicationPages()
}

// Cache constants that can be safely imported by both client and server components
export const CACHE_TAGS = {
  // Data-specific tags
  APPLICATIONS_DATA: "applications-data",
  APPLICATIONS_BOARD: "applications-board",
  PENDING_APPLICATIONS: "pending-applications",
  GMAIL_MESSAGES: "gmail-messages",
  FAILED_EMAILS: "failed-emails",

  // Resume-specific tags
  RESUMES_DATA: "resumes-data",
  RESUME_DETAILS: "resume-details",

  // Match-specific tags
  MATCHES_DATA: "matches-data",
  MATCH_DETAILS: "match-details",
  MATCH_STATS: "match-stats",
  RECOMMENDATIONS_DATA: "recommendations-data",

  // Job Discovery tags
  JOB_DISCOVERY_JOBS: "job-discovery-jobs",
  JOB_DISCOVERY_RUNS: "job-discovery-runs",
  JOB_DISCOVERY_DATA: "job-discovery-data",

  // Interview Prep tags
  INTERVIEW_SESSIONS: "interview-sessions",
  INTERVIEW_QUESTIONS: "interview-questions",
  INTERVIEW_BRIEFS: "interview-briefs",
  STAR_STORIES: "star-stories",
  INTERVIEW_PREP_DATA: "interview-prep-data",

  // Page-level tags
  DASHBOARD_DATA: "dashboard-data",
  BOARD_DATA: "board-data",
  RESUMES_PAGE_DATA: "resumes-page-data",
  MATCHES_PAGE_DATA: "matches-page-data",
  JOB_DISCOVERY_PAGE_DATA: "job-discovery-page-data",
  INTERVIEW_PREP_PAGE_DATA: "interview-prep-page-data",
} as const;

export const CACHE_PATHS = {
  DASHBOARD: "/dashboard",
  BOARD: "/dashboard/board",
  ADD_APPLICATION: "/dashboard/add-application",
  RESUMES: "/dashboard/resumes",
  MATCHES: "/dashboard/matches",
  JOB_DISCOVERY: "/dashboard/job-discovery",
  INTERVIEW_PREP: "/dashboard/interview-prep",
} as const;

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
} as const;
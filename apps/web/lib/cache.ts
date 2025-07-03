import { revalidatePath, revalidateTag } from "next/cache";

// Cache tag definitions
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

// Cache revalidation utilities
export function revalidateApplicationData() {
  revalidateTag(CACHE_TAGS.APPLICATIONS_DATA);
  revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA);
  revalidateTag(CACHE_TAGS.BOARD_DATA);
}

export function revalidatePendingApplications() {
  revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA);
}

export function revalidateGmailData() {
  revalidateTag(CACHE_TAGS.GMAIL_MESSAGES);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA);
}

export function revalidateFailedEmails() {
  revalidateTag(CACHE_TAGS.FAILED_EMAILS);
  revalidateTag(CACHE_TAGS.BOARD_DATA);
}

export function revalidateResumeData() {
  revalidateTag(CACHE_TAGS.RESUMES_DATA);
  revalidateTag(CACHE_TAGS.RESUME_DETAILS);
  revalidateTag(CACHE_TAGS.RESUMES_PAGE_DATA);
}

export function revalidateResumeDetails(resumeId?: string) {
  revalidateTag(CACHE_TAGS.RESUME_DETAILS);
  if (resumeId) {
    revalidateTag(`${CACHE_TAGS.RESUME_DETAILS}-${resumeId}`);
  }
}

export function revalidateAllApplicationData() {
  revalidateTag(CACHE_TAGS.APPLICATIONS_DATA);
  revalidateTag(CACHE_TAGS.APPLICATIONS_BOARD);
  revalidateTag(CACHE_TAGS.PENDING_APPLICATIONS);
  revalidateTag(CACHE_TAGS.DASHBOARD_DATA);
  revalidateTag(CACHE_TAGS.BOARD_DATA);
}

export function revalidateApplicationPages() {
  revalidatePath(CACHE_PATHS.DASHBOARD);
  revalidatePath(CACHE_PATHS.BOARD);
  revalidatePath(CACHE_PATHS.ADD_APPLICATION);
}

export function revalidateResumePages() {
  revalidatePath(CACHE_PATHS.RESUMES);
}

export function revalidateAllResumeData() {
  revalidateResumeData();
  revalidateResumePages();
}

export function revalidateMatchData() {
  revalidateTag(CACHE_TAGS.MATCHES_DATA);
  revalidateTag(CACHE_TAGS.MATCH_DETAILS);
  revalidateTag(CACHE_TAGS.MATCH_STATS);
  revalidateTag(CACHE_TAGS.MATCHES_PAGE_DATA);
}

export function revalidateRecommendationsData() {
  revalidateTag(CACHE_TAGS.RECOMMENDATIONS_DATA);
  revalidateTag(CACHE_TAGS.MATCHES_PAGE_DATA);
}

export function revalidateMatchDetails(matchId?: string) {
  revalidateTag(CACHE_TAGS.MATCH_DETAILS);
  if (matchId) {
    revalidateTag(`${CACHE_TAGS.MATCH_DETAILS}-${matchId}`);
  }
}

export function revalidateMatchPages() {
  revalidatePath(CACHE_PATHS.MATCHES);
}

export function revalidateAllMatchData() {
  revalidateMatchData();
  revalidateRecommendationsData();
  revalidateMatchPages();
}

export function revalidateJobDiscoveryData() {
  revalidateTag(CACHE_TAGS.JOB_DISCOVERY_JOBS);
  revalidateTag(CACHE_TAGS.JOB_DISCOVERY_RUNS);
  revalidateTag(CACHE_TAGS.JOB_DISCOVERY_DATA);
  revalidateTag(CACHE_TAGS.JOB_DISCOVERY_PAGE_DATA);
}

export function revalidateJobDiscoveryPages() {
  revalidatePath(CACHE_PATHS.JOB_DISCOVERY);
}

export function revalidateAllJobDiscoveryData() {
  revalidateJobDiscoveryData();
  revalidateJobDiscoveryPages();
}

export function revalidateInterviewPrepData() {
  revalidateTag(CACHE_TAGS.INTERVIEW_SESSIONS);
  revalidateTag(CACHE_TAGS.INTERVIEW_QUESTIONS);
  revalidateTag(CACHE_TAGS.INTERVIEW_BRIEFS);
  revalidateTag(CACHE_TAGS.STAR_STORIES);
  revalidateTag(CACHE_TAGS.INTERVIEW_PREP_DATA);
  revalidateTag(CACHE_TAGS.INTERVIEW_PREP_PAGE_DATA);
  // Also revalidate applications and resumes data since they're used in interview prep
  revalidateTag(CACHE_TAGS.APPLICATIONS_DATA);
  revalidateTag(CACHE_TAGS.RESUMES_DATA);
}

export function revalidateInterviewSessionData(sessionId: string) {
  // Invalidate session-specific cache tag
  revalidateTag(`interview-session-${sessionId}`);
  // Invalidate general interview prep data
  revalidateTag(CACHE_TAGS.INTERVIEW_SESSIONS);
  revalidateTag(CACHE_TAGS.INTERVIEW_QUESTIONS);
  revalidateTag(CACHE_TAGS.INTERVIEW_BRIEFS);
  revalidateTag(CACHE_TAGS.INTERVIEW_PREP_DATA);
  revalidateTag(CACHE_TAGS.INTERVIEW_PREP_PAGE_DATA);
}

export function revalidateInterviewPrepPages() {
  revalidatePath(CACHE_PATHS.INTERVIEW_PREP);
}

export function revalidateAllInterviewPrepData() {
  revalidateInterviewPrepData();
  revalidateInterviewPrepPages();
}

export function revalidateAllCacheAndPages() {
  revalidateAllApplicationData();
  revalidateGmailData();
  revalidateFailedEmails();
  revalidateAllResumeData();
  revalidateAllMatchData();
  revalidateAllJobDiscoveryData();
  revalidateAllInterviewPrepData();
  revalidateApplicationPages();
}

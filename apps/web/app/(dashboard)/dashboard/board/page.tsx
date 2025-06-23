import { CACHE_CONFIG, CACHE_TAGS } from "@/lib/cache";
import { getWorkerUrl } from "@/lib/worker-utils";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { type FailedEmail } from "../_lib/actions/failed-email-actions";
import { BoardPageWrapper } from "./_components/board-page-wrapper";

// Interface for applications data
interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  notes?: string;
  job_url?: string;
  source_email_id?: string;
  source_thread_id?: string;
  order_in_column?: number;
}

// Cached applications fetcher for board - cookies moved outside
const getCachedApplicationsForBoard = unstable_cache(
  async (cookieString: string): Promise<Application[]> => {
    try {
      const workerUrl = getWorkerUrl();
      if (!workerUrl) {
        return [];
      }

      const response = await fetch(`${workerUrl}/api/applications`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
      });

      if (!response.ok) {
        return [];
      }

      const result = await response.json();

      if (result.error) {
        return [];
      }

      const applications = result.data || [];

      return applications as Application[];
    } catch {
      return [];
    }
  },
  [CACHE_TAGS.APPLICATIONS_BOARD],
  {
    tags: [CACHE_TAGS.APPLICATIONS_BOARD, CACHE_TAGS.BOARD_DATA],
    revalidate: CACHE_CONFIG.MEDIUM.revalidate,
  },
);

async function getApplicationsForBoard(
  cookieString: string,
): Promise<Application[]> {
  return getCachedApplicationsForBoard(cookieString);
}

// Cached failed emails fetcher for board - cookies moved outside
const getCachedFailedEmailsForBoard = unstable_cache(
  async (cookieString: string): Promise<FailedEmail[]> => {
    try {
      const workerUrl = getWorkerUrl();
      if (!workerUrl) {
        return [];
      }

      const response = await fetch(`${workerUrl}/api/gmail/failed-emails`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString,
        },
      });

      if (!response.ok) {
        return [];
      }

      const result = await response.json();

      if (result.error) {
        return [];
      }

      const failedEmails = result.failedEmails || [];

      return failedEmails as FailedEmail[];
    } catch {
      return [];
    }
  },
  [CACHE_TAGS.FAILED_EMAILS],
  {
    tags: [CACHE_TAGS.FAILED_EMAILS, CACHE_TAGS.BOARD_DATA],
    revalidate: CACHE_CONFIG.LONG.revalidate,
  },
);

async function getFailedEmailsForBoard(
  cookieString: string,
): Promise<FailedEmail[]> {
  return getCachedFailedEmailsForBoard(cookieString);
}

export default async function BoardPage() {
  // Get cookies outside of cached functions
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();

  const [applications, failedEmails] = await Promise.all([
    getApplicationsForBoard(cookieString),
    getFailedEmailsForBoard(cookieString),
  ]);

  // Group applications by status for kanban board
  const applicationsByStatus = {
    Opportunity: applications.filter((app) => app.status === "Opportunity"),
    Wishlist: applications.filter((app) => app.status === "Wishlist"),
    Applied: applications.filter((app) => app.status === "Applied"),
    Screening: applications.filter((app) => app.status === "Screening"),
    Interviewing: applications.filter((app) => app.status === "Interviewing"),
    Offer: applications.filter((app) => app.status === "Offer"),
    Rejected: applications.filter((app) => app.status === "Rejected"),
    Withdrawn: applications.filter((app) => app.status === "Withdrawn"),
  };

  return (
    <BoardPageWrapper
      applicationsByStatus={applicationsByStatus}
      failedEmails={failedEmails}
    />
  );
}

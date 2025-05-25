import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KanbanBoard } from "./_components/kanban-board";
import {
  getFailedEmailsAction,
  type FailedEmail,
} from "../_lib/actions/failed-email-actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Plus } from "lucide-react";
// TODO: Enable when component is ready
// import { BoardWithRealtime } from "./_components/board-with-realtime";

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

async function getApplicationsForBoard(): Promise<Application[]> {
  const cookieStore = await cookies();
  const token = cookieStore.toString();

  const workerBaseUrl =
    process.env.NEXT_PUBLIC_WORKER_BASE_URL || "http://localhost:8787";

  if (!workerBaseUrl) {
    console.error("Board: NEXT_PUBLIC_WORKER_BASE_URL is not set.");
    throw new Error("Worker service is not configured (missing base URL).");
  }

  try {
    const response = await fetch(`${workerBaseUrl}/api/applications`, {
      headers: {
        Cookie: token,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 3600, // Cache for 1 hour
        tags: ["applications-board"], // Add cache tag
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch applications: ${response.statusText}`);
    }

    const data = await response.json();
    // Ensure data is sorted by order_in_column, then by applied_at
    const applications: Application[] = data.data || [];
    applications.sort((a, b) => {
      const orderA = a.order_in_column ?? 0;
      const orderB = b.order_in_column ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // Secondary sort by applied_at (descending) if order_in_column is the same
      return (
        new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
      );
    });
    return applications;
  } catch (error) {
    console.error("Error fetching applications for board:", error);
    throw error;
  }
}

async function getFailedEmailsForBoard(): Promise<FailedEmail[]> {
  try {
    const result = await getFailedEmailsAction();
    if (result.success) {
      return result.data || [];
    } else {
      console.error("Error fetching failed emails for board:", result.error);
      return [];
    }
  } catch (error) {
    console.error("Error fetching failed emails for board:", error);
    return [];
  }
}

export default async function BoardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      "/auth/login?error=session_error&details=Could not retrieve session."
    );
  }

  // Fetch applications and failed emails data
  let applications: Application[] = [];
  let failedEmails: FailedEmail[] = [];
  try {
    [applications, failedEmails] = await Promise.all([
      getApplicationsForBoard(),
      getFailedEmailsForBoard(),
    ]);
  } catch (error) {
    console.error("Error loading board data:", error);
    // We'll handle this in the UI rather than redirecting
  }

  // Group applications by status
  const applicationsByStatus = {
    Wishlist: applications.filter((app) => app.status === "Wishlist"),
    Applied: applications.filter((app) => app.status === "Applied"),
    Screening: applications.filter((app) => app.status === "Screening"),
    Interviewing: applications.filter((app) => app.status === "Interviewing"),
    Offer: applications.filter((app) => app.status === "Offer"),
    Rejected: applications.filter((app) => app.status === "Rejected"),
    Withdrawn: applications.filter((app) => app.status === "Withdrawn"),
  };

  return (
    <div className="flex flex-col h-full space-y-4 p-6 pb-8">
      <div className="flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-bold">Application Board</h1>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/dashboard/add-application">
              <Plus className="h-4 w-4 mr-2" />
              Add Application
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard View</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Realtime sync handling */}
      {/* <BoardWithRealtime /> */}

      {applications.length === 0 && failedEmails.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center flex-1 rounded-lg border-2 border-dashed border-muted">
          <h2 className="text-lg font-medium mb-2">No applications yet</h2>
          <p className="text-muted-foreground mb-4">
            Your applications will appear here after connecting Gmail and
            scanning your emails for job-related messages.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <KanbanBoard
            applicationsByStatus={applicationsByStatus}
            failedEmails={failedEmails}
          />
        </div>
      )}
    </div>
  );
}

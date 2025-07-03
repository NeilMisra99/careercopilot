"use client";

import { Button } from "@/components/ui/button";
import { LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FailedEmail } from "../../_lib/actions/failed-email-actions";
import { KanbanBoard } from "./kanban-board";

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

interface BoardPageWrapperProps {
  applicationsByStatus: {
    Opportunity: Application[];
    Wishlist: Application[];
    Applied: Application[];
    Screening: Application[];
    Interviewing: Application[];
    Offer: Application[];
    Rejected: Application[];
    Withdrawn: Application[];
  };
  failedEmails: FailedEmail[];
}

export function BoardPageWrapper({
  applicationsByStatus,
  failedEmails,
}: BoardPageWrapperProps) {
  const router = useRouter();

  const handleApplicationUpdated = () => {
    setTimeout(() => {
      router.refresh();
    }, 100);
  };

  return (
    <div className="bg-background relative h-full overflow-hidden">
      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col p-6">
        {/* Header Section - flex-shrink-0 */}
        <div className="mb-6 flex flex-shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-medium">
              Application Board
            </h1>
            <p className="text-muted-foreground text-sm">
              Track your applications through the hiring process
            </p>
          </div>

          <div className="flex gap-3">
            <Button asChild variant="default" size="sm">
              <Link href="/dashboard/add-application">
                <Plus className="h-4 w-4" />
                Add Application
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        {/* Main Content - flex-1 min-h-0 */}
        <div className="min-h-0 flex-1">
          <KanbanBoard
            applicationsByStatus={applicationsByStatus}
            failedEmails={failedEmails}
            onApplicationUpdated={handleApplicationUpdated}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
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
    router.refresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-white p-4 sm:p-6 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-zinc-950"
    >
      <div className="mx-auto max-w-[2000px]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Application Board
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Track your applications through the hiring process
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard/add-application">
                <Plus className="mr-2 h-4 w-4" />
                Add Application
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <KanbanBoard
            applicationsByStatus={applicationsByStatus}
            failedEmails={failedEmails}
            onApplicationUpdated={handleApplicationUpdated}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

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
    setTimeout(() => {
      router.refresh();
    }, 100);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex h-full flex-col p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Application Board
          </h1>
          <p className="text-muted-foreground">
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
        className="flex-1 overflow-hidden"
      >
        <KanbanBoard
          applicationsByStatus={applicationsByStatus}
          failedEmails={failedEmails}
          onApplicationUpdated={handleApplicationUpdated}
        />
      </motion.div>
    </motion.div>
  );
}

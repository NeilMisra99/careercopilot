"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useSyncProgress } from "@/hooks/use-sync-progress";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AnimatedSetupPageWrapperProps {
  children: React.ReactNode;
}

// Background gradient configurations based on sync status - matching the actual banner gradients
const getBackgroundGradient = (
  syncStatus: string | null,
  error?: string | null
) => {
  if (error) {
    return "from-red-50/90 via-rose-50/40 to-pink-50/30 dark:from-red-950/30 dark:via-rose-950/20 dark:to-pink-950/10";
  }

  if (syncStatus === "completed") {
    return "from-emerald-50/90 via-green-50/40 to-teal-50/30 dark:from-emerald-950/30 dark:via-green-950/20 dark:to-teal-950/10";
  }

  if (syncStatus === "ai_first_processing") {
    return "from-violet-50/90 via-purple-50/40 to-indigo-50/30 dark:from-violet-950/30 dark:via-purple-950/20 dark:to-indigo-950/10";
  }

  if (syncStatus === "preparing") {
    return "from-blue-50/90 via-indigo-50/40 to-slate-50/30 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-slate-950/10";
  }

  // Default: first time / no sync - matching FirstTimeSyncBanner gradient
  return "from-slate-50/90 via-emerald-50/30 to-teal-50/20 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30";
};

export function AnimatedSetupPageWrapper({
  children,
}: AnimatedSetupPageWrapperProps) {
  // Get current user to pass to useSyncProgress
  const [userId, setUserId] = useState<string | undefined>();
  const { syncState, loading } = useSyncProgress(userId);
  const prevKeyRef = useRef<string>("");
  const renderCountRef = useRef(0);

  // Get user ID on mount
  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id);
    };
    getUser();
  }, []);

  // Direct key derivation like in the test component - no useState/useEffect needed
  const syncStatus = syncState?.summary?.status;
  const error = syncState?.summary?.error;
  const currentKey = error ? "error" : syncStatus || "initial";
  const backgroundGradient = getBackgroundGradient(syncStatus || null, error);

  // Track renders and key changes
  renderCountRef.current += 1;
  const keyChanged = prevKeyRef.current !== currentKey;
  if (keyChanged) {
    prevKeyRef.current = currentKey;
  }

  // Don't render until we have userId (prevents hook from running without userId)
  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50/90 via-emerald-50/30 to-teal-50/20 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30">
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background with AnimatePresence for smooth transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className={`absolute inset-0 bg-gradient-to-br ${backgroundGradient}`}
        />
      </AnimatePresence>

      {/* Content with animation key passed down */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Mail, CheckCircle, Clock, Sparkles } from "lucide-react";
import { syncGmailNowAction } from "../_lib/actions/sync-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface FirstTimeSyncBannerProps {
  integrationEmail?: string | null;
  userId?: string;
  isPreparingSync?: boolean;
  onSyncInitiated?: () => void;
}

export function FirstTimeSyncBanner({
  integrationEmail,
  userId,
  isPreparingSync = false,
  onSyncInitiated,
}: FirstTimeSyncBannerProps) {
  const [isInitiatingSync, setIsInitiatingSync] = useState(false);

  const handleStartSync = async () => {
    setIsInitiatingSync(true);

    onSyncInitiated?.();

    try {
      const result = await syncGmailNowAction();
      if (result.success) {
        toast.success("Sync started!", {
          description:
            "Your emails are being processed. This may take a moment to begin...",
          duration: 4000,
        });
      } else {
        toast.error("Sync failed", {
          description: result.error || "Unknown error occurred",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Failed to start sync. Please try again.",
      });
    } finally {
      setIsInitiatingSync(false);
    }
  };

  const showPreparingState = isInitiatingSync || isPreparingSync;

  if (showPreparingState) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.5, ease: [0.25, 0.25, 0, 1] }}
        className="min-h-[400px] flex items-center justify-center px-4"
      >
        <Card className="w-full max-w-2xl border-slate-200/60 bg-gradient-to-br from-slate-50/90 via-blue-50/40 to-indigo-50/30 dark:border-slate-700/60 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/40">
          <CardContent className="p-12">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.1,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="text-center space-y-8"
            >
              {/* Icon with pulse effect */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  duration: 0.8,
                  delay: 0.2,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                className="relative flex justify-center"
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="absolute inset-0 w-20 h-20 rounded-full bg-blue-500/20 animate-ping mx-auto"
                />
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/80 dark:to-indigo-900/80 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/50"
                >
                  <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                </motion.div>
              </motion.div>

              {/* Content */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.6,
                  delay: 0.4,
                  ease: [0.25, 0.25, 0, 1],
                }}
                className="space-y-4"
              >
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  Preparing Your Sync
                </h3>
                <p className="text-base text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                  {isInitiatingSync
                    ? "Initiating email synchronization with Gmail..."
                    : "Setting up the connection and preparing to scan your emails. This may take a moment."}
                </p>
              </motion.div>

              {/* Status indicator */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-blue-100/80 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-700/50"
              >
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Please wait while we prepare your sync
                </span>
              </motion.div>

              {/* Email display */}
              <AnimatePresence>
                {integrationEmail && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, delay: 0.6 }}
                    className="bg-slate-100/80 dark:bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-200/50 dark:border-slate-700/50"
                  >
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <Mail className="w-4 h-4" />
                      <span className="font-medium">{integrationEmail}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.25, 0.25, 0, 1] }}
      className="min-h-[400px] flex items-center justify-center px-4"
    >
      <Card className="w-full max-w-2xl border-slate-200/60 bg-gradient-to-br from-slate-50/90 via-emerald-50/30 to-teal-50/20 dark:border-slate-700/60 dark:from-slate-900/90 dark:via-slate-800/40 dark:to-slate-700/30 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/40">
        <CardContent className="p-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.25, 0, 1] }}
            className="text-center space-y-8"
          >
            {/* Icon with gradient */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.2,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="relative flex justify-center"
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/80 dark:to-teal-900/80 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-700/50 shadow-lg shadow-emerald-200/20 dark:shadow-emerald-900/20"
              >
                <Mail className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="absolute -top-1 -right-1"
              >
                <Sparkles className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </motion.div>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="space-y-4"
            >
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {integrationEmail
                  ? "Gmail Connected Successfully!"
                  : "Connect Your Gmail"}
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                {integrationEmail
                  ? `Ready to discover job applications in ${integrationEmail}`
                  : "Connect your Gmail account to automatically track and organize your job applications"}
              </p>
            </motion.div>

            {/* Action button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.4,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="pt-2"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleStartSync}
                  disabled={isInitiatingSync}
                  size="lg"
                  className="h-12 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 dark:from-emerald-600 dark:to-teal-600 dark:hover:from-emerald-700 dark:hover:to-teal-700 text-white shadow-lg shadow-emerald-200/25 dark:shadow-emerald-900/25 border-0"
                >
                  {isInitiatingSync ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5 mr-3" />
                      {integrationEmail
                        ? "Start Scanning Emails"
                        : "Connect Gmail"}
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>

            {/* Features grid */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.5,
                ease: [0.25, 0.25, 0, 1],
              }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6"
            >
              {[
                { label: "Last 30 Days", delay: 0.6 },
                { label: "Smart Detection", delay: 0.7 },
                { label: "Auto Updates", delay: 0.8 },
              ].map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: feature.delay }}
                  className="flex flex-col items-center gap-3 p-4 rounded-lg bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {feature.label}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

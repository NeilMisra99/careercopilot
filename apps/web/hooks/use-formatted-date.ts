"use client";

import { useEffect, useState } from "react";

interface DateFormatOptions {
  format?: "short" | "long" | "relative";
  locale?: string;
}

/**
 * Hook to safely format dates on both server and client, preventing hydration errors
 * @param date - Date string, Date object, or null/undefined
 * @param options - Formatting options
 * @returns Formatted date string that's consistent between server and client
 */
export function useFormattedDate(
  date: string | Date | null | undefined,
  options: DateFormatOptions = {}
): string {
  const { format = "short", locale = "en-US" } = options;
  
  // Use a stable placeholder during SSR and initial client render
  const [formattedDate, setFormattedDate] = useState<string>(() => {
    if (!date) return "";
    
    // Return ISO string during SSR for consistency
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "Invalid date";
    
    // During SSR, return a simple format that won't cause hydration issues
    return dateObj.toISOString().split("T")[0];
  });

  useEffect(() => {
    if (!date) {
      setFormattedDate("");
      return;
    }

    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      setFormattedDate("Invalid date");
      return;
    }

    let formatted: string;

    switch (format) {
      case "long":
        formatted = new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(dateObj);
        break;

      case "relative":
        formatted = getRelativeTimeString(dateObj);
        break;

      case "short":
      default:
        formatted = new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(dateObj);
        break;
    }

    setFormattedDate(formatted);
  }, [date, format, locale]);

  return formattedDate;
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
function getRelativeTimeString(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const absSeconds = Math.abs(diffInSeconds);

  const units: Array<[number, string]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];

  let value = absSeconds;
  let unit = "second";

  for (const [divisor, unitName] of units) {
    if (value < divisor) {
      unit = unitName;
      break;
    }
    value = Math.floor(value / divisor);
  }

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return rtf.format(diffInSeconds < 0 ? -value : value, unit as any);
}

/**
 * Utility function to safely compare dates without hydration issues
 */
export function compareDates(date1: string | Date, date2: string | Date): number {
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;
  return d1.getTime() - d2.getTime();
}

/**
 * Check if a date is within the last N days
 */
export function isWithinDays(date: string | Date, days: number): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return dateObj.getTime() > daysAgo.getTime();
}
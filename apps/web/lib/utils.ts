import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(email?: string | null): string {
  if (!email) return "U"
  return email.substring(0, 2).toUpperCase()
}

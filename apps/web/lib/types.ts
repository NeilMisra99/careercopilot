export type application_status_enum =
  | "Wishlist"
  | "Applied"
  | "Screening"
  | "Interviewing"
  | "Offer"
  | "Rejected"
  | "Withdrawn"

export interface Application {
  id: string
  user_id: string
  company_name: string
  role: string
  job_url?: string | null
  status: application_status_enum
  applied_at: string // timestamptz
  notes?: string | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
  application_date: string // date
  dedupe_key: string
  source_email_id?: string | null
  source_thread_id?: string | null
}

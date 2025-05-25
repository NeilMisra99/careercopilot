import { z } from "zod";

// Form validation schema
export const applicationFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  status: z.enum([
    "Wishlist",
    "Applied",
    "Screening",
    "Interviewing",
    "Offer",
    "Rejected",
    "Withdrawn",
  ]),
  applicationDate: z.string().min(1, "Application date is required"),
  jobUrl: z.string().url().optional().or(z.literal("")),
  location: z.string().optional(),
  salary: z.string().optional(),
  notes: z.string().optional(),
});

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;

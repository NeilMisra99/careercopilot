import { UseFormReturn } from "react-hook-form"

import {
  DatePicker,
  formatDateToLocalString,
  parseDateFromLocalString,
} from "@/components/ui/date-picker"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { type ApplicationFormData } from "../_lib/types"

interface JobDetailsSectionProps {
  form: UseFormReturn<ApplicationFormData>
}

const statusOptions = [
  { value: "Pending Review", label: "Pending Review" },
  { value: "Wishlist", label: "Wishlist" },
  { value: "Applied", label: "Applied" },
  { value: "Screening", label: "Screening" },
  { value: "Interviewing", label: "Interviewing" },
  { value: "Offer", label: "Offer" },
  { value: "Rejected", label: "Rejected" },
  { value: "Withdrawn", label: "Withdrawn" },
] as const

export function JobDetailsSection({ form }: JobDetailsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Job Details</h3>
        <p className="text-sm text-muted-foreground">
          Enter the basic information about this job application.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Name */}
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Google, Microsoft, Stripe"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Job Title */}
        <FormField
          control={form.control}
          name="jobTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Senior Software Engineer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Application Status */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Application Status *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Application Date */}
        <FormField
          control={form.control}
          name="applicationDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Application Date *</FormLabel>
              <FormControl>
                <DatePicker
                  date={parseDateFromLocalString(field.value)}
                  onDateChange={(date) => {
                    field.onChange(date ? formatDateToLocalString(date) : "")
                  }}
                  placeholder="Select application date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}

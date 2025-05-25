"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import type { application_status_enum, Application } from "@/lib/types";

export async function updateApplicationStatusServerAction(
  applicationId: string,
  newStatus: application_status_enum | string
): Promise<{ data: Application | null; error: Error | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) {
    console.error("Error updating application status (Server Action):", error);
    return { data: null, error: new Error(error.message) };
  }

  revalidateTag("applications-board");

  return { data: data as Application, error: null };
}

interface ApplicationOrderUpdate {
  id: string;
  order_in_column: number;
}

export async function updateApplicationOrderServerAction(
  updates: ApplicationOrderUpdate[]
): Promise<{ data?: { count: number }; error: Error | null }> {
  if (!updates || updates.length === 0) {
    return { error: new Error("No updates provided.") };
  }

  const supabase = await createClient();

  let totalUpdatedCount = 0;
  let anyError: Error | null = null;

  for (const update of updates) {
    const { data, error } = await supabase
      .from("applications")
      .update({
        order_in_column: update.order_in_column,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .select("id");

    if (error) {
      console.error(
        `Error updating order for application ${update.id} (Server Action):`,
        error
      );
      anyError = new Error(
        `Failed to update order for app ${update.id}: ${error.message}`
      );
      break;
    }
    if (data && data.length > 0) {
      totalUpdatedCount++;
    }
  }

  if (anyError) {
    return { error: anyError };
  }

  if (totalUpdatedCount > 0) {
    revalidateTag("applications-board");
  }

  return { data: { count: totalUpdatedCount }, error: null };
}

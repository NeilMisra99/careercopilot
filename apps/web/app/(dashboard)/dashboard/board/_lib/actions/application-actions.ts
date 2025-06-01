"use server";

import { revalidateApplicationData } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import type { Application, application_status_enum } from "@/lib/types";

export async function updateApplicationStatusServerAction(
  applicationId: string,
  newStatus: application_status_enum | string,
): Promise<{ data: Application | null; error: Error | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // Revalidate cache using centralized utilities
  revalidateApplicationData();

  return { data, error: null };
}

interface ApplicationOrderUpdate {
  id: string;
  order_in_column: number;
}

export async function updateApplicationOrderServerAction(
  updates: ApplicationOrderUpdate[],
): Promise<{ data?: { count: number }; error: Error | null }> {
  const supabase = await createClient();

  try {
    // Batch update using Promise.all for better performance
    const updatePromises = updates.map(async (update) => {
      const { error } = await supabase
        .from("applications")
        .update({
          order_in_column: update.order_in_column,
          updated_at: new Date().toISOString(),
        })
        .eq("id", update.id);

      if (error) {
        throw new Error(
          `Failed to update application ${update.id}: ${error.message}`,
        );
      }
      return update.id;
    });

    const updatedIds = await Promise.all(updatePromises);

    // Revalidate cache using centralized utilities
    revalidateApplicationData();

    return { data: { count: updatedIds.length }, error: null };
  } catch (error: unknown) {
    return {
      data: undefined,
      error: new Error(
        error instanceof Error ? error.message : "Unknown error",
      ),
    };
  }
}

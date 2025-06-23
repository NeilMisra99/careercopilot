import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export default function createClient() {
  const supabase = createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return supabase;
}

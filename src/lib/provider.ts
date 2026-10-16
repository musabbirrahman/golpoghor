import { getSupabase, isSupabaseConfigured } from "./supabase";
import { SupabaseProvider } from "./providers/supabase-provider";
import { DemoProvider } from "./providers/demo-provider";
import type { DataProvider } from "./data-provider";

/**
 * Backend selection: real Supabase when credentials are configured,
 * otherwise the local demo provider (data stays in this browser).
 */
function createProvider(): DataProvider {
  const sb = getSupabase();
  if (isSupabaseConfigured && sb) return new SupabaseProvider(sb);
  return new DemoProvider();
}

export const dp: DataProvider = createProvider();
export const isDemoMode = dp.kind === "demo";

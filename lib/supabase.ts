import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Browser client — uses anon key, respects RLS.
// Deferred so the build doesn't crash when NEXT_PUBLIC_SUPABASE_ANON_KEY is absent.
// Required for Phase 3 (auth/likes). Add the key from Supabase > Project Settings > API.
export function createBrowserClient() {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

// Server client — uses service role, bypasses RLS
// Only imported in server-side code (API routes, server components)
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey)
}

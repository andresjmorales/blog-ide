/**
 * True once real Supabase credentials are set. With missing or placeholder
 * values (fresh clone), the app runs in an unauthenticated preview mode so
 * the shell can be explored before setup.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("placeholder") && !key.includes("placeholder"));
}

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve a user's account_id from the profiles table.
 *
 * Lighter-weight alternative to `getCurrentAccount` — returns just the
 * account_id string (or null) without loading the full account row or
 * role. Useful in routes that only need tenancy scoping but handle
 * their own error responses.
 */
export async function resolveAccountId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

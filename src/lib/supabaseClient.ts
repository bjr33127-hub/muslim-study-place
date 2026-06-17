import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    __MSP_SUPABASE_MOCK__?: SupabaseClient
  }
}

let supabaseClient: SupabaseClient | null = null

function envValue(value: string | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function isSupabaseConfigured() {
  if (typeof window !== 'undefined' && window.__MSP_SUPABASE_MOCK__) {
    return true
  }

  return Boolean(
    envValue(import.meta.env.VITE_SUPABASE_URL) &&
      envValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
  )
}

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && window.__MSP_SUPABASE_MOCK__) {
    return window.__MSP_SUPABASE_MOCK__
  }

  const url = envValue(import.meta.env.VITE_SUPABASE_URL)
  const anonKey = envValue(import.meta.env.VITE_SUPABASE_ANON_KEY)

  if (!url || !anonKey) {
    return null
  }

  supabaseClient ??= createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })

  return supabaseClient
}

// The anon key is a public, RLS-constrained client key by design (same one
// already shipped in the web app's own bundle) — safe to embed here. It can
// never read/write anything the signed-in user's session and the table
// policies don't already allow.
export const SUPABASE_URL = 'https://lqhpjluskinuocumwtml.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaHBqbHVza2ludW9jdW13dG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTgyNjMsImV4cCI6MjEwMTY3NDI2M30.fYDO3HhTclq5dcnae8Rbnmu_xSJ9MQecpRIvn-nu67E'
export const WEB_APP_URL = 'https://myrecruitercheck.com'

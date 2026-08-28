// Temporary deployment target for the PUBLIC keyword-scan slug during
// cutover steps 3-9 (see RUNBOOK.md). Deployed BEFORE the Part A migration
// and BEFORE the real implementation ever reaches this slug. Returns 503
// unconditionally, before parsing or charging anything.
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return new Response(
    JSON.stringify({
      error: 'unavailable',
      message:
        'Keyword Scan is temporarily unavailable for a scheduled upgrade. Please try again shortly.',
    }),
    {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})

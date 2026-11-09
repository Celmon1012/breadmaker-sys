// Sends the Business Leak Test result email and pushes the lead to the nurture
// webhook (n8n), once, right after someone unlocks their result.
//
//   POST { submissionId, token, event? } -> { sent }
//   event is "submitted" (default) or "paid" (the report was unlocked with a code)
//
// The token proves the caller owns the submission, so nobody can trigger emails
// for other people's results. A repeat call is a no-op.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, optional
// N8N_LEAK_WEBHOOK_URL, N8N_LEAK_WEBHOOK_SECRET, PUBLIC_SITE_URL, LEAK_TEST_FROM.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, json } from '../_shared/flutterwave.ts';
import { notifyLead } from '../_shared/leaktest.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = String(body.submissionId ?? '').trim();
    const token = String(body.token ?? '').trim();
    if (!submissionId || !token) return json({ error: 'submissionId and token are required.' }, 400);

    const { data: owned, error: ownedError } = await admin()
      .from('leak_test_submissions')
      .select('id, paid_tier')
      .eq('id', submissionId)
      .eq('access_token', token)
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (!owned) return json({ error: 'We could not find that result.' }, 404);

    // "paid" is for a result unlocked with a code; a paid payment sends its own email.
    const event = body.event === 'paid' ? 'paid' : 'submitted';
    if (event === 'paid' && !owned.paid_tier) return json({ error: 'This report is not unlocked.' }, 403);

    const result = await notifyLead(submissionId, event);
    return json(result);
  } catch (error) {
    console.error('leak-test-notify failed', error);
    return json({ error: (error as Error).message ?? 'Could not send the result.' }, 500);
  }
});

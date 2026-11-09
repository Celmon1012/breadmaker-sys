import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LAGO_API_URL = 'https://api.getlago.com/api/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { plan, gateway } = await req.json();

    // Fetch user profile
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();

    const lagoApiKey = Deno.env.get('LAGO_API_KEY');
    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const flutterwaveSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

    // 1. Create or get Lago Customer
    let lagoCustomerId = profile?.lago_customer_id;
    if (!lagoCustomerId) {
      lagoCustomerId = `cust_${user.id}`;
      await fetch(`${LAGO_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lagoApiKey}` },
        body: JSON.stringify({
          customer: {
            external_id: lagoCustomerId,
            email: user.email,
            name: profile?.full_name || user.email,
            currency: 'USD'
          }
        })
      });
      // Save to profile
      await supabaseAdmin.from('profiles').update({ lago_customer_id: lagoCustomerId }).eq('id', user.id);
    }

    // 2. Determine price and amount (Simplified for this example)
    // Ensure the plan is prefixed with bm_ for Breadmaker ecosystem routing
    const prefixedPlan = plan.startsWith('bm_') ? plan : `bm_${plan}`;

    let amount = 0;
    if (prefixedPlan === 'bm_learner') amount = 1900; // $19.00 -> 1900 cents
    else if (prefixedPlan === 'bm_operator') amount = 4900;
    else if (prefixedPlan === 'bm_course_pioneer') amount = 7500; // one off course

    if (amount === 0) throw new Error(`Invalid plan: ${prefixedPlan}`);

    let checkoutParams: any = {};

    // 3. Create Checkout Session based on gateway
    if (gateway === 'paystack') {
      const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100, // Paystack is in kobo/cents
          currency: 'NGN', 
          metadata: { user_id: user.id, plan: prefixedPlan }
        })
      });
      const psData = await psRes.json();
      if (!psData.status) throw new Error(psData.message);
      
      checkoutParams = {
        gateway: 'paystack',
        accessCode: psData.data.access_code,
        publicKey: Deno.env.get('PAYSTACK_PUBLIC_KEY'),
        email: user.email,
        amount: amount * 100
      };
    } else if (gateway === 'flutterwave') {
      // Flutterwave Inline just needs the keys and the payload to mount directly.
      checkoutParams = {
        gateway: 'flutterwave',
        publicKey: Deno.env.get('FLUTTERWAVE_PUBLIC_KEY'),
        txRef: `tx-${user.id}-${Date.now()}`,
        amount: amount / 100, // Standard unit
        currency: 'NGN',
        customer: { email: user.email, name: profile?.full_name },
        meta: { user_id: user.id, plan: prefixedPlan }
      };
    } else {
      throw new Error('Unsupported gateway');
    }

    return new Response(
      JSON.stringify(checkoutParams),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

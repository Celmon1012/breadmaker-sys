import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // In a production environment, verify the Lago signature using Deno crypto and the Lago webhook secret.
    // https://doc.getlago.com/docs/api/webhooks/signature
    
    console.log("Lago webhook received:", payload.webhook_type);

    const event = payload.webhook_type;
    
    // Process Subscription Terminated Event
    if (event === 'subscription.terminated') {
      const lagoCustomerId = payload.subscription.customer.external_id;
      const planCode = payload.subscription.plan_code;
      
      if (lagoCustomerId.startsWith('cust_') && planCode) {
        const userId = lagoCustomerId.replace('cust_', '');
        
        const isBreadmaker = planCode.startsWith('bm_');
        const isRestart = planCode.startsWith('rs_');
        const targetSchema = isBreadmaker ? 'breadmaker' : isRestart ? 'restart' : null;

        if (targetSchema) {
          // Downgrade the user to free in the appropriate schema
          await supabaseAdmin
            .schema(targetSchema)
            .from('profiles')
            .update({ role: 'free' })
            .eq('id', userId);
          console.log(`Downgraded user ${userId} to free in ${targetSchema} due to subscription termination.`);
        }
      }
    }
    
    // Process Invoice Created Event (for recurring payments)
    else if (event === 'invoice.created') {
      const invoice = payload.invoice;
      const amountCents = invoice.amount_cents;
      const lagoCustomerId = invoice.customer.external_id;

      if (amountCents > 0 && lagoCustomerId.startsWith('cust_')) {
        const userId = lagoCustomerId.replace('cust_', '');

        // Fetch user's saved payment tokens from both schemas to be safe, or just breadmaker
        // Assuming breadmaker is the source of truth for payment methods
        const { data: profile } = await supabaseAdmin
          .schema('breadmaker')
          .from('profiles')
          .select('paystack_auth_code, flutterwave_token, email')
          .eq('id', userId)
          .single();

        if (profile) {
          try {
            if (profile.paystack_auth_code) {
              // Trigger Paystack Tokenized Charge
              const psRes = await fetch('https://api.paystack.co/transaction/charge_authorization', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  email: profile.email,
                  amount: amountCents * 100, // assuming Lago amount is in cents, Paystack expects kobo
                  authorization_code: profile.paystack_auth_code
                })
              });
              const psData = await psRes.json();
              if (!psData.status) throw new Error(`Paystack charge failed: ${psData.message}`);
              console.log(`Successfully charged Paystack for user ${userId}`);
            } else if (profile.flutterwave_token) {
              // Trigger Flutterwave Tokenized Charge
              const fwRes = await fetch('https://api.flutterwave.com/v3/tokenized-charges', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('FLUTTERWAVE_SECRET_KEY')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  token: profile.flutterwave_token,
                  currency: 'NGN',
                  amount: amountCents / 100, // Flutterwave standard unit
                  email: profile.email,
                  tx_ref: `tx-ren-${userId}-${Date.now()}`
                })
              });
              const fwData = await fwRes.json();
              if (fwData.status !== 'success') throw new Error(`Flutterwave charge failed: ${fwData.message}`);
              console.log(`Successfully charged Flutterwave for user ${userId}`);
            } else {
              console.warn(`No payment token found for user ${userId}. Manual payment required.`);
            }
          } catch (chargeError) {
            console.error(`Failed to process recurring charge for ${userId}:`, chargeError);
            // Optionally, call Lago API to update the invoice status to "failed" here.
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Lago Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 }
    );
  }
});

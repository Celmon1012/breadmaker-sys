import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  try {
    const signature = req.headers.get('x-paystack-signature') || req.headers.get('verif-hash');
    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);

    // In a production environment, verify the signature using the Paystack/Flutterwave secret.
    // Paystack uses HMAC SHA512 of the body using the secret key.
    // Flutterwave uses a custom verif-hash header that matches the secret hash set in their dashboard.

    console.log("Payment webhook received:", payload.event);

    // Process Payload Function
    const processPayment = async (userId: string, plan: string, authCode?: string, fwToken?: string) => {
      if (!userId || !plan) return;
      
      const isBreadmaker = plan.startsWith('bm_');
      const isRestart = plan.startsWith('rs_');
      const targetSchema = isBreadmaker ? 'breadmaker' : isRestart ? 'restart' : null;

      if (!targetSchema) return;

      const normalizedPlan = plan.replace('bm_', '').replace('rs_', '');
      
      let newRole = 'free';
      if (normalizedPlan === 'learner') newRole = 'learner';
      else if (normalizedPlan === 'operator') newRole = 'operator';
      else if (normalizedPlan === 'admin') newRole = 'admin';
      
      const updatePayload: any = {};
      if (newRole !== 'free') updatePayload.role = newRole;
      if (authCode) updatePayload.paystack_auth_code = authCode;
      if (fwToken) updatePayload.flutterwave_token = fwToken;
      
      if (Object.keys(updatePayload).length > 0) {
        await supabaseAdmin
          .schema(targetSchema)
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId);
        console.log(`Updated profile in ${targetSchema}.profiles for ${userId}`);
      }
    };

    // 1. Process Paystack Event
    if (payload.event === 'charge.success') {
      const metadata = payload.data.metadata;
      const authCode = payload.data.authorization?.authorization_code;
      await processPayment(metadata?.user_id, metadata?.plan, authCode, undefined);
    } 
    // 2. Process Flutterwave Event
    else if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
      const metadata = payload.data.meta;
      const fwToken = payload.data.card?.token;
      await processPayment(metadata?.user_id, metadata?.plan, undefined, fwToken);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // 1. Trigger/validate profile completion (Mocked logic here)
    // 2. Create restart.profiles row (We will just update breadmaker.profiles for now since they share DB)
    // 3. Set restart_linked = true on breadmaker.profiles
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ restart_linked: true })
      .eq('id', user.id)

    if (updateError) {
      throw new Error(`Failed to link Restart account: ${updateError.message}`)
    }

    // 4. Call Lago API to provision rs_* deployment line item (Mocked for now)
    console.log(`Provisioning Lago rs_* deployment for user ${user.id}...`)

    // 5. Emit deployment job to Restart provisioning queue (Mocked for now)
    console.log(`Emitting deployment job to Restart queue for user ${user.id}...`)

    return new Response(
      JSON.stringify({ success: true, message: 'Restart account linked and deployment initiated' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

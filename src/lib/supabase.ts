import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://db.restart.ng';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2ODMyODQwMCwiZXhwIjo0OTI0MDAyMDAwLCJyb2xlIjoiYW5vbiJ9.F82jgg29c_wSxsAm5zV1aZuIypVRdsJ0JQwXh2kno4c';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('Missing Supabase URL or Anon Key. Please check your .env file or deployment environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'breadmaker',
  },
});

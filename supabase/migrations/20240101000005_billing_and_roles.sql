-- Create user role enum
CREATE TYPE breadmaker.user_role AS ENUM ('free', 'learner', 'operator', 'admin');

-- Add new columns to profiles
ALTER TABLE breadmaker.profiles
ADD COLUMN role breadmaker.user_role DEFAULT 'free',
ADD COLUMN platform TEXT DEFAULT 'breadmaker',
ADD COLUMN lago_customer_id TEXT,
ADD COLUMN paystack_customer_id TEXT,
ADD COLUMN flutterwave_customer_id TEXT,
ADD COLUMN restart_linked BOOLEAN DEFAULT false;

-- Update RLS for course access based on roles
-- Assuming the courses table currently allows everyone to view them.
-- If we want to gate course CONTENT (like lessons), we would apply this to a lessons table.
-- For now, let's just make sure the `role` is accessible by the user.
-- The existing RLS policy on `profiles` allows users to view all public profiles and update their own.
-- However, we shouldn't allow users to UPDATE their own role directly from the client.
-- We need to drop and recreate the update policy to prevent users from modifying restricted columns.

DROP POLICY IF EXISTS "Users can update own profile." ON breadmaker.profiles;

CREATE POLICY "Users can update own profile." ON breadmaker.profiles
FOR UPDATE USING ((select auth.uid()) = id)
WITH CHECK (
    -- Ensure they don't change their role or customer IDs directly
    -- (This requires triggers or explicit column grants, but a simple way in Supabase is a trigger to prevent changes to these columns if not service_role)
    (select auth.uid()) = id
);

-- Better yet, use a trigger to protect the billing columns from client-side updates
CREATE OR REPLACE FUNCTION breadmaker.protect_billing_columns()
RETURNS trigger AS $$
BEGIN
  -- If the update is coming from an authenticated user (not service_role)
  IF auth.role() = 'authenticated' THEN
    -- Ensure they aren't trying to change restricted columns
    IF NEW.role IS DISTINCT FROM OLD.role OR
       NEW.lago_customer_id IS DISTINCT FROM OLD.lago_customer_id OR
       NEW.paystack_customer_id IS DISTINCT FROM OLD.paystack_customer_id OR
       NEW.flutterwave_customer_id IS DISTINCT FROM OLD.flutterwave_customer_id OR
       NEW.restart_linked IS DISTINCT FROM OLD.restart_linked THEN
       RAISE EXCEPTION 'Not allowed to modify billing or role columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_billing_columns_trigger ON breadmaker.profiles;
CREATE TRIGGER protect_billing_columns_trigger
  BEFORE UPDATE ON breadmaker.profiles
  FOR EACH ROW EXECUTE PROCEDURE breadmaker.protect_billing_columns();

-- Add payment token columns for recurring billing
ALTER TABLE breadmaker.profiles
ADD COLUMN paystack_auth_code TEXT,
ADD COLUMN flutterwave_token TEXT;

-- Since the user might need this across the ecosystem, let's also ensure restart schema is considered if it exists.
-- But since restart schema is not directly managed here, we only alter breadmaker.profiles.

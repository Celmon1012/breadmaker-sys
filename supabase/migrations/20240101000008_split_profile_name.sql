-- Split profiles.full_name into first_name/last_name so callers can address
-- a user by first name alone without parsing full_name.
ALTER TABLE breadmaker.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

UPDATE breadmaker.profiles
SET
  first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
  last_name = COALESCE(last_name, NULLIF(trim(substring(full_name FROM position(' ' IN full_name) + 1)), ''))
WHERE full_name IS NOT NULL;

-- full_name becomes derived so it can never drift from first_name/last_name.
ALTER TABLE breadmaker.profiles DROP COLUMN full_name;
ALTER TABLE breadmaker.profiles
  ADD COLUMN full_name TEXT GENERATED ALWAYS AS (trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) STORED;

CREATE OR REPLACE FUNCTION breadmaker.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO breadmaker.profiles (id, email, first_name, last_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

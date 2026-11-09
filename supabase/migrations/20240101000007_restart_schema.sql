-- Create the restart schema
CREATE SCHEMA IF NOT EXISTS restart;

-- Restart profiles table
CREATE TABLE restart.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_breadmaker_user_id UUID REFERENCES breadmaker.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for restart.profiles
ALTER TABLE restart.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own restart profile" ON restart.profiles
  FOR SELECT USING (auth.uid() = id);

-- Restart deployments table
CREATE TABLE restart.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES restart.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES breadmaker.profiles(id) ON DELETE CASCADE, -- linking back to breadmaker org
  status TEXT DEFAULT 'pending',
  instance_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for restart.deployments
ALTER TABLE restart.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own restart deployments" ON restart.deployments
  FOR SELECT USING (auth.uid() = user_id);

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS breadmaker.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  company TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS for profiles
ALTER TABLE breadmaker.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON breadmaker.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON breadmaker.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "Users can update own profile." ON breadmaker.profiles FOR UPDATE USING ((select auth.uid()) = id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION breadmaker.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO breadmaker.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function after a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE breadmaker.handle_new_user();

-- 2. Create courses table
CREATE TABLE IF NOT EXISTS breadmaker.courses (
  id TEXT PRIMARY KEY, -- Use text to match the 'c1', 'c2' ids in data.ts
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  image_url TEXT,
  total_lessons INTEGER DEFAULT 0,
  total_hours NUMERIC DEFAULT 0,
  badges JSONB,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE breadmaker.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courses are viewable by everyone." ON breadmaker.courses FOR SELECT USING (true);
-- Admin only for insert/update/delete, for now let's allow service role or authenticated
CREATE POLICY "Service role can insert courses." ON breadmaker.courses FOR ALL USING (true);

-- 3. Create user_course_progress table
CREATE TABLE IF NOT EXISTS breadmaker.user_course_progress (
  user_id UUID REFERENCES breadmaker.profiles(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES breadmaker.courses(id) ON DELETE CASCADE,
  completed_lessons INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id)
);

ALTER TABLE breadmaker.user_course_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own progress." ON breadmaker.user_course_progress FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own progress." ON breadmaker.user_course_progress FOR ALL USING ((select auth.uid()) = user_id);

-- 4. Grant permissions
GRANT USAGE ON SCHEMA breadmaker TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA breadmaker TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA breadmaker TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA breadmaker TO anon, authenticated, service_role;

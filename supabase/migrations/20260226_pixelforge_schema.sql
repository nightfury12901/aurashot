-- ─────────────────────────────────────────────────────────
-- PixelForge AI — Schema Migration
-- ─────────────────────────────────────────────────────────

-- 1. Add mask_image column to existing templates table
ALTER TABLE portrait_templates 
  ADD COLUMN IF NOT EXISTS mask_image text;

-- 2. Profiles table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text,
  tier               text NOT NULL DEFAULT 'free'
                       CHECK (tier IN ('free', 'starter', 'creator', 'pro')),
  credits_reset_date timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 3. Generations table (tracks every usage event — NO credits_remaining column)
CREATE TABLE IF NOT EXISTS generations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operation_type text        NOT NULL
                   CHECK (operation_type IN (
                     'portrait','enhance','bg_remove',
                     'beautify','prompt_reversal','image_gen'
                   )),
  template_id    text,
  output_url     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes for fast per-user usage counting
CREATE INDEX IF NOT EXISTS idx_generations_user_op
  ON generations (user_id, operation_type, created_at);

-- 5. Row Level Security
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own row
DROP POLICY IF EXISTS "Users own profile" ON profiles;
CREATE POLICY "Users own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Generations: users can only see/insert their own rows
DROP POLICY IF EXISTS "Users own generations" ON generations;
CREATE POLICY "Users own generations" ON generations
  FOR ALL USING (auth.uid() = user_id);

-- 6. Auto-create profile on new auth user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

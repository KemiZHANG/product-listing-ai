-- ============================================================================
-- Nano Banana Web - Supabase SQL Schema Migration
-- Multi-user image generation app with Gemini Batch API
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Storage Buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('outputs', 'outputs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only manage files in their own folder (user_id prefix)
CREATE POLICY "Users can upload images to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can upload outputs to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'outputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own outputs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'outputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own outputs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'outputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own outputs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'outputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 2. Profiles (extends auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name_zh     TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📦',
  sort_order  INT NOT NULL DEFAULT 0,
  is_preset   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own categories"
ON public.categories FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_categories_user_id ON public.categories(user_id);
CREATE INDEX idx_categories_user_sort ON public.categories(user_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Category Prompts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.category_prompts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  prompt_number INT NOT NULL,
  prompt_text   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, prompt_number)
);

ALTER TABLE public.category_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD prompts in their own categories"
ON public.category_prompts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_prompts.category_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_prompts.category_id
      AND c.user_id = auth.uid()
  )
);

CREATE INDEX idx_category_prompts_category_id ON public.category_prompts(category_id);
CREATE INDEX idx_category_prompts_number ON public.category_prompts(category_id, prompt_number);

-- ---------------------------------------------------------------------------
-- 5. Category Images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.category_images (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id       UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.category_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD images in their own categories"
ON public.category_images FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_images.category_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_images.category_id
      AND c.user_id = auth.uid()
  )
);

CREATE INDEX idx_category_images_category_id ON public.category_images(category_id);

-- ---------------------------------------------------------------------------
-- 6. Jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'idle'
                   CHECK (status IN ('idle','queued','running','partial_success','completed','failed','cancelled')),
  total_items      INT NOT NULL DEFAULT 0,
  completed_items  INT NOT NULL DEFAULT 0,
  failed_items     INT NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own jobs"
ON public.jobs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX idx_jobs_status ON public.jobs(user_id, status);
CREATE INDEX idx_jobs_created_at ON public.jobs(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Job Snapshots (freeze config at run time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_snapshots (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  category_id        UUID,
  category_name_zh   TEXT NOT NULL,
  category_slug      TEXT NOT NULL,
  snapshot_prompts   JSONB NOT NULL DEFAULT '[]',
  snapshot_images    JSONB NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access snapshots of their own jobs"
ON public.job_snapshots FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_snapshots.job_id
      AND j.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_snapshots.job_id
      AND j.user_id = auth.uid()
  )
);

CREATE INDEX idx_job_snapshots_job_id ON public.job_snapshots(job_id);

-- ---------------------------------------------------------------------------
-- 8. Job Items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_items (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                    UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  snapshot_id               UUID NOT NULL REFERENCES public.job_snapshots(id) ON DELETE CASCADE,
  image_display_name        TEXT NOT NULL,
  image_storage_path        TEXT NOT NULL,
  prompt_number             INT NOT NULL,
  prompt_text               TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled')),
  error_message             TEXT,
  output_storage_path       TEXT,
  output_filename           TEXT,
  gemini_batch_request_key  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access items of their own jobs"
ON public.job_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_items.job_id
      AND j.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_items.job_id
      AND j.user_id = auth.uid()
  )
);

CREATE INDEX idx_job_items_job_id ON public.job_items(job_id);
CREATE INDEX idx_job_items_snapshot_id ON public.job_items(snapshot_id);
CREATE INDEX idx_job_items_status ON public.job_items(job_id, status);
CREATE INDEX idx_job_items_batch_key ON public.job_items(gemini_batch_request_key)
  WHERE gemini_batch_request_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. Outputs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outputs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_item_id         UUID NOT NULL REFERENCES public.job_items(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id         UUID,
  category_slug       TEXT NOT NULL,
  image_display_name  TEXT NOT NULL,
  prompt_number       INT NOT NULL,
  output_filename     TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  file_size_bytes     BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own outputs"
ON public.outputs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_outputs_user_id ON public.outputs(user_id);
CREATE INDEX idx_outputs_job_id ON public.outputs(job_id);
CREATE INDEX idx_outputs_job_item_id ON public.outputs(job_item_id);
CREATE INDEX idx_outputs_category ON public.outputs(user_id, category_slug);
CREATE INDEX idx_outputs_created_at ON public.outputs(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. System Settings (per-user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                      UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  gemini_api_key_encrypted     TEXT,
  use_builtin_key              BOOLEAN NOT NULL DEFAULT false,
  builtin_key_password_verified BOOLEAN NOT NULL DEFAULT false,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own settings"
ON public.system_settings FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_system_settings_user_id ON public.system_settings(user_id);

-- ---------------------------------------------------------------------------
-- 11. Utility: Renumber prompts after deletion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renumber_category_prompts(p_category_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  _new_number INT := 1;
BEGIN
  FOR r IN
    SELECT id
    FROM public.category_prompts
    WHERE category_id = p_category_id
    ORDER BY prompt_number ASC
  LOOP
    UPDATE public.category_prompts
    SET prompt_number = _new_number,
        updated_at = now()
    WHERE id = r.id;
    _new_number := _new_number + 1;
  END LOOP;
END;
$$;

-- Trigger: auto-renumber after a prompt is deleted
CREATE OR REPLACE FUNCTION public.trigger_renumber_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.renumber_category_prompts(OLD.category_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_prompts_on_delete ON public.category_prompts;
CREATE TRIGGER trg_renumber_prompts_on_delete
  AFTER DELETE ON public.category_prompts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_renumber_after_delete();

-- ---------------------------------------------------------------------------
-- 12. Updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_profiles ON public.profiles;
CREATE TRIGGER trg_set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_categories ON public.categories;
CREATE TRIGGER trg_set_updated_at_categories
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_category_prompts ON public.category_prompts;
CREATE TRIGGER trg_set_updated_at_category_prompts
  BEFORE UPDATE ON public.category_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_jobs ON public.jobs;
CREATE TRIGGER trg_set_updated_at_jobs
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_job_items ON public.job_items;
CREATE TRIGGER trg_set_updated_at_job_items
  BEFORE UPDATE ON public.job_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_system_settings ON public.system_settings;
CREATE TRIGGER trg_set_updated_at_system_settings
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

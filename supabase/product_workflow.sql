-- ============================================================================
-- Product-centered generation workflow
-- Run this after supabase/schema.sql for existing projects.
-- ============================================================================

-- 1. Product attribute columns shared by all products for the current user.
CREATE TABLE IF NOT EXISTS public.product_attribute_columns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_key TEXT NOT NULL DEFAULT 'external' CHECK (workspace_key IN ('internal','external')),
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_key, name)
);

ALTER TABLE public.product_attribute_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD their own product attribute columns" ON public.product_attribute_columns;
CREATE POLICY "Users can CRUD their own product attribute columns"
ON public.product_attribute_columns FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_product_attribute_columns_user_sort
ON public.product_attribute_columns(user_id, sort_order);

-- 2. Product master rows.
CREATE TABLE IF NOT EXISTS public.products (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_key       TEXT NOT NULL DEFAULT 'external' CHECK (workspace_key IN ('internal','external')),
  category_id         UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sku                 TEXT NOT NULL,
  source_title        TEXT NOT NULL DEFAULT '',
  source_description  TEXT NOT NULL DEFAULT '',
  selling_points      TEXT NOT NULL DEFAULT '',
  copy_count          INT NOT NULL DEFAULT 1 CHECK (copy_count BETWEEN 1 AND 20),
  languages           TEXT[] NOT NULL DEFAULT ARRAY['en'],
  attributes          JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','ready','queued','generating','completed','failed','needs_review')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_key, sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD their own products" ON public.products;
CREATE POLICY "Users can CRUD their own products"
ON public.products FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_products_user_created
ON public.products(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_user_category
ON public.products(user_id, category_id);

-- 3. Product reference images. All images for a product can be used together.
CREATE TABLE IF NOT EXISTS public.product_images (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD images for their own products" ON public.product_images;
CREATE POLICY "Users can CRUD images for their own products"
ON public.product_images FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
ON public.product_images(product_id, sort_order);

-- 4. Editable generation rules, including the Shopee title/content/image rules.
CREATE TABLE IF NOT EXISTS public.rule_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_key TEXT NOT NULL DEFAULT 'external' CHECK (workspace_key IN ('internal','external')),
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'general'
              CHECK (scope IN ('general','title_description','image','platform')),
  content     TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_key, name)
);

ALTER TABLE public.rule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD their own rule templates" ON public.rule_templates;
CREATE POLICY "Users can CRUD their own rule templates"
ON public.rule_templates FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rule_templates_user_scope
ON public.rule_templates(user_id, scope, active);

-- 5. Product copies: each generated listing variation for a SKU/language.
CREATE TABLE IF NOT EXISTS public.product_copies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id              UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_key           TEXT NOT NULL DEFAULT 'external' CHECK (workspace_key IN ('internal','external')),
  sku                     TEXT NOT NULL,
  copy_index              INT NOT NULL,
  language_code           TEXT NOT NULL,
  language_label          TEXT NOT NULL,
  generated_title         TEXT NOT NULL DEFAULT '',
  generated_description   TEXT NOT NULL DEFAULT '',
  staff_note              TEXT NOT NULL DEFAULT '',
  status                  TEXT NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','generating','completed','failed','needs_review')),
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, copy_index, language_code)
);

ALTER TABLE public.product_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD their own product copies" ON public.product_copies;
CREATE POLICY "Users can CRUD their own product copies"
ON public.product_copies FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_product_copies_user_created
ON public.product_copies(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_copies_product
ON public.product_copies(product_id);

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS staff_note TEXT NOT NULL DEFAULT '';

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'not_listed';

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS store_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ;

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS operator_note TEXT NOT NULL DEFAULT '';

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS operator_email TEXT;

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS seo_score INT NOT NULL DEFAULT 0;

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'warning';

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS quality_report JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_copies_listing_status_check'
  ) THEN
    ALTER TABLE public.product_copies
    ADD CONSTRAINT product_copies_listing_status_check
    CHECK (listing_status IN ('not_listed','listed','needs_edit','paused','done'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_copies_quality_status_check'
  ) THEN
    ALTER TABLE public.product_copies
    ADD CONSTRAINT product_copies_quality_status_check
    CHECK (quality_status IN ('pass','warning','fail'));
  END IF;
END $$;

-- 5b. Workspace sharing migration.
ALTER TABLE public.product_attribute_columns
ADD COLUMN IF NOT EXISTS workspace_key TEXT NOT NULL DEFAULT 'external'
CHECK (workspace_key IN ('internal','external'));

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS workspace_key TEXT NOT NULL DEFAULT 'external'
CHECK (workspace_key IN ('internal','external'));

ALTER TABLE public.rule_templates
ADD COLUMN IF NOT EXISTS workspace_key TEXT NOT NULL DEFAULT 'external'
CHECK (workspace_key IN ('internal','external'));

ALTER TABLE public.product_copies
ADD COLUMN IF NOT EXISTS workspace_key TEXT NOT NULL DEFAULT 'external'
CHECK (workspace_key IN ('internal','external'));

UPDATE public.product_attribute_columns
SET workspace_key = 'internal'
WHERE user_id IN (
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.builtin_key_authorizations a ON a.email = lower(trim(p.email))
  WHERE lower(trim(p.email)) IN ('links358p@gmail.com') OR a.active = true
);

UPDATE public.products
SET workspace_key = 'internal'
WHERE user_id IN (
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.builtin_key_authorizations a ON a.email = lower(trim(p.email))
  WHERE lower(trim(p.email)) IN ('links358p@gmail.com') OR a.active = true
);

UPDATE public.rule_templates
SET workspace_key = 'internal'
WHERE user_id IN (
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.builtin_key_authorizations a ON a.email = lower(trim(p.email))
  WHERE lower(trim(p.email)) IN ('links358p@gmail.com') OR a.active = true
);

UPDATE public.product_copies
SET workspace_key = 'internal'
WHERE user_id IN (
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.builtin_key_authorizations a ON a.email = lower(trim(p.email))
  WHERE lower(trim(p.email)) IN ('links358p@gmail.com') OR a.active = true
);

ALTER TABLE public.product_attribute_columns
DROP CONSTRAINT IF EXISTS product_attribute_columns_user_id_name_key;

ALTER TABLE public.product_attribute_columns
DROP CONSTRAINT IF EXISTS product_attribute_columns_workspace_key_name_key;

WITH ranked_attribute_names AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_key, name
      ORDER BY created_at NULLS FIRST, id
    ) AS rn
  FROM public.product_attribute_columns
  WHERE name IS NOT NULL AND btrim(name) <> ''
)
UPDATE public.product_attribute_columns pac
SET name = pac.name || ' [migrated ' || ranked_attribute_names.rn || ']'
FROM ranked_attribute_names
WHERE pac.id = ranked_attribute_names.id
  AND ranked_attribute_names.rn > 1;

ALTER TABLE public.product_attribute_columns
ADD CONSTRAINT product_attribute_columns_workspace_key_name_key UNIQUE (workspace_key, name);

ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_user_id_sku_key;

ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_workspace_key_sku_key;

WITH ranked_product_skus AS (
  SELECT
    id,
    sku,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_key, sku
      ORDER BY created_at NULLS FIRST, id
    ) AS rn
  FROM public.products
  WHERE sku IS NOT NULL AND btrim(sku) <> ''
)
UPDATE public.products p
SET sku = p.sku || '-M' || ranked_product_skus.rn
FROM ranked_product_skus
WHERE p.id = ranked_product_skus.id
  AND ranked_product_skus.rn > 1;

ALTER TABLE public.products
ADD CONSTRAINT products_workspace_key_sku_key UNIQUE (workspace_key, sku);

ALTER TABLE public.rule_templates
DROP CONSTRAINT IF EXISTS rule_templates_user_id_name_key;

ALTER TABLE public.rule_templates
DROP CONSTRAINT IF EXISTS rule_templates_workspace_key_name_key;

WITH ranked_rule_names AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_key, name
      ORDER BY created_at NULLS FIRST, id
    ) AS rn
  FROM public.rule_templates
  WHERE name IS NOT NULL AND btrim(name) <> ''
)
UPDATE public.rule_templates rt
SET name = rt.name || ' [migrated ' || ranked_rule_names.rn || ']'
FROM ranked_rule_names
WHERE rt.id = ranked_rule_names.id
  AND ranked_rule_names.rn > 1;

ALTER TABLE public.rule_templates
ADD CONSTRAINT rule_templates_workspace_key_name_key UNIQUE (workspace_key, name);

CREATE INDEX IF NOT EXISTS idx_product_attribute_columns_workspace_sort
ON public.product_attribute_columns(workspace_key, sort_order);

CREATE INDEX IF NOT EXISTS idx_products_workspace_created
ON public.products(workspace_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_workspace_category
ON public.products(workspace_key, category_id);

CREATE INDEX IF NOT EXISTS idx_rule_templates_workspace_scope
ON public.rule_templates(workspace_key, scope, active);

CREATE INDEX IF NOT EXISTS idx_product_copies_workspace_created
ON public.product_copies(workspace_key, created_at DESC);

-- 6. Generated image rows for each copy.
CREATE TABLE IF NOT EXISTS public.product_copy_images (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  copy_id               UUID NOT NULL REFERENCES public.product_copies(id) ON DELETE CASCADE,
  prompt_number         INT NOT NULL,
  prompt_role           TEXT NOT NULL DEFAULT 'custom',
  prompt_text           TEXT NOT NULL,
  output_storage_path   TEXT,
  output_filename       TEXT,
  pending_storage_path  TEXT,
  pending_filename      TEXT,
  pending_regeneration_note TEXT NOT NULL DEFAULT '',
  previous_storage_path TEXT,
  previous_filename     TEXT,
  status                TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','generating','completed','failed','needs_review')),
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (copy_id, prompt_number)
);

ALTER TABLE public.product_copy_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD images for their own copies" ON public.product_copy_images;
CREATE POLICY "Users can CRUD images for their own copies"
ON public.product_copy_images FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.product_copies c
    WHERE c.id = product_copy_images.copy_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.product_copies c
    WHERE c.id = product_copy_images.copy_id
      AND c.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_product_copy_images_copy
ON public.product_copy_images(copy_id, prompt_number);

-- 7. Prompt roles. Existing installs can keep the same table and gain metadata.
ALTER TABLE public.category_prompts
ADD COLUMN IF NOT EXISTS prompt_role TEXT NOT NULL DEFAULT 'custom';

-- 8. Updated_at triggers.
DROP TRIGGER IF EXISTS trg_set_updated_at_product_attribute_columns ON public.product_attribute_columns;
CREATE TRIGGER trg_set_updated_at_product_attribute_columns
  BEFORE UPDATE ON public.product_attribute_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_products ON public.products;
CREATE TRIGGER trg_set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_rule_templates ON public.rule_templates;
CREATE TRIGGER trg_set_updated_at_rule_templates
  BEFORE UPDATE ON public.rule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_product_copies ON public.product_copies;
CREATE TRIGGER trg_set_updated_at_product_copies
  BEFORE UPDATE ON public.product_copies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_product_copy_images ON public.product_copy_images;
CREATE TRIGGER trg_set_updated_at_product_copy_images
  BEFORE UPDATE ON public.product_copy_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. Seed the editable Shopee rule template from the supplied PDF summary.
INSERT INTO public.rule_templates (user_id, workspace_key, name, scope, content, active)
SELECT
  p.id,
  CASE
    WHEN lower(trim(p.email)) = 'links358p@gmail.com'
      OR EXISTS (
        SELECT 1 FROM public.builtin_key_authorizations a
        WHERE a.email = lower(trim(p.email))
          AND a.active = true
      )
    THEN 'internal'
    ELSE 'external'
  END,
  'Shopee title, description, and image rules',
  'platform',
  'Strictly avoid prohibited content in titles, descriptions, images, and videos. Do not mention off-platform contacts or links. Do not use misleading pricing, profanity, HTML/code, competitor platform names/logos, or unsupported claims. For beauty/personal-care, do not promote medical, drug-like, disease treatment, disease prevention, whitening, anti-allergy, hair-growth, antibacterial, or exaggerated efficacy claims. Ingredients must use INCI names when included, and ingredients must not be tied to medical efficacy. Titles should follow: core keyword + long-tail keyword + attributes + usage scene, or product name/model + specification + applicable scene/user. Do not keyword-stuff, use emojis, hashtags, extreme words, competitor brands, false original/authentic claims, medical-grade terms, or incomplete compatibility wording. Descriptions should be structured as: key selling points, specifications, usage instructions/applicable users, package contents, after-sales note. Keep the meaning true to the source product. Images should be square 1024x1024 when possible, under platform size limits, non-duplicated, matching title and description, with no off-platform contact information. Prefer distinct hero, lifestyle, detail, and selling-point images.',
  true
FROM public.profiles p
ON CONFLICT (workspace_key, name) DO NOTHING;

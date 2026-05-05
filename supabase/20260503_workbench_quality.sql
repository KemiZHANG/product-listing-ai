-- Workbench, retry, SEO score, and quality report columns.
-- Safe to run multiple times in Supabase SQL Editor.

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

CREATE INDEX IF NOT EXISTS idx_product_copies_workspace_listing
ON public.product_copies(workspace_key, listing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_copies_workspace_quality
ON public.product_copies(workspace_key, quality_status, seo_score);

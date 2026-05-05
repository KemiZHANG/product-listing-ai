-- Image regeneration review workflow.
-- Run this before deploying the image compare/confirm UI.

ALTER TABLE public.product_copy_images
ADD COLUMN IF NOT EXISTS pending_storage_path TEXT,
ADD COLUMN IF NOT EXISTS pending_filename TEXT,
ADD COLUMN IF NOT EXISTS pending_regeneration_note TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS previous_storage_path TEXT,
ADD COLUMN IF NOT EXISTS previous_filename TEXT;

CREATE INDEX IF NOT EXISTS idx_product_copy_images_pending_review
ON public.product_copy_images(copy_id, status)
WHERE pending_storage_path IS NOT NULL;

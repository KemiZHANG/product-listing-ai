-- Workspace-level RLS hardening.
-- This keeps the current service-role API working, but also protects future
-- anon/authenticated queries if an API forgets to add workspace_key filters.
-- Safe to run multiple times.

CREATE OR REPLACE FUNCTION public.current_workspace_key()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(auth.jwt() ->> 'email', '')) = 'links358p@gmail.com'
      OR EXISTS (
        SELECT 1
        FROM public.builtin_key_authorizations a
        WHERE a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
          AND a.active = true
      )
    THEN 'internal'
    ELSE 'external'
  END;
$$;

DROP POLICY IF EXISTS "Users can CRUD their workspace product copies" ON public.product_copies;
CREATE POLICY "Users can CRUD their workspace product copies"
ON public.product_copies FOR ALL
USING (workspace_key = public.current_workspace_key())
WITH CHECK (workspace_key = public.current_workspace_key());

DROP POLICY IF EXISTS "Users can CRUD workspace images for product copies" ON public.product_copy_images;
CREATE POLICY "Users can CRUD workspace images for product copies"
ON public.product_copy_images FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.product_copies c
    WHERE c.id = product_copy_images.copy_id
      AND c.workspace_key = public.current_workspace_key()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.product_copies c
    WHERE c.id = product_copy_images.copy_id
      AND c.workspace_key = public.current_workspace_key()
  )
);

DROP POLICY IF EXISTS "Users can CRUD their workspace products" ON public.products;
CREATE POLICY "Users can CRUD their workspace products"
ON public.products FOR ALL
USING (workspace_key = public.current_workspace_key())
WITH CHECK (workspace_key = public.current_workspace_key());

DROP POLICY IF EXISTS "Users can CRUD their workspace rules" ON public.rule_templates;
CREATE POLICY "Users can CRUD their workspace rules"
ON public.rule_templates FOR ALL
USING (workspace_key = public.current_workspace_key())
WITH CHECK (workspace_key = public.current_workspace_key());

DROP POLICY IF EXISTS "Users can CRUD their workspace categories" ON public.categories;
CREATE POLICY "Users can CRUD their workspace categories"
ON public.categories FOR ALL
USING (workspace_key = public.current_workspace_key())
WITH CHECK (workspace_key = public.current_workspace_key());

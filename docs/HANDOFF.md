# Project handoff

## Repository shape

- Main repo:
  - `C:/Users/张祎鸣/Desktop/AIGC/nano-banana-web`
- Resume deploy mirror:
  - `C:/Users/张祎鸣/Desktop/AIGC/nano-banana-web-resume-deploy`

The preferred long-term model is one maintained codebase plus two Vercel projects. The mirror repo should stay a deployment convenience only, not a second source of truth.

## Editions

### `DLM AI`

- `APP_EDITION=company`
- internal-only
- registration and login require authorization
- company Supabase project

Primary admin:

- `links358p@gmail.com`

Secondary admin:

- `irenephang220@gmail.com`

Important:

- only the primary admin bypasses authorization
- secondary admins still need an active authorization record

### `Listing Studio`

- `APP_EDITION=resume`
- public registration
- separate Supabase project
- public demo data only

## Auth behavior

Company edition authorization is enforced at:

- login and register endpoints
- API auth helpers
- client-side auth gate with recurring re-check

Revoked company users:

- fail `/api/auth/access`
- are signed out when the current session is revalidated
- can no longer use app APIs

## SQL order

Run these for a new environment:

1. `supabase/schema.sql`
2. `supabase/product_workflow.sql`
3. `supabase/builtin_key_authorizations.sql`
4. `supabase/20260503_image_regeneration_review.sql`
5. `supabase/20260503_workbench_quality.sql`

Do not run yet:

1. `supabase/20260503_workspace_rls_hardening.sql`

## Reference-data sync

Use:

```bash
node scripts/sync-resume-reference-data.mjs
```

This syncs reference data from the internal workspace into the resume workspace:

- categories
- category prompts
- rule templates
- SEO keyword banks
- category images

It does not copy product rows, product copies, or employee workflow data.

## Legacy cleanup

Use the legacy cleanup script before asking for manual SQL edits:

```bash
npm run cleanup:legacy-six-image-data -- --mode=tasks-only
```

Recommended flow:

1. run dry-run
2. inspect JSON backup
3. rerun with `--execute`

Modes:

- `tasks-only`: collapse old image task display only
- `tasks-and-prompts`: also normalize old prompt-role mappings

## Observability

Current server logs cover:

- auth access denied
- register blocked / failed / succeeded
- signed URL denied / invalid bucket / sign failure
- allowlisted client auth failure events

Watch these in Vercel logs:

- `/api/auth/access`
- `/api/auth/register`
- `/api/storage/signed-urls`

## Deployment steps

1. Build in the main repo:

```bash
npm run build
```

2. Sync the resume mirror if needed, excluding:

- `.git`
- `.vercel`
- `node_modules`
- `.next`
- `.env.local`
- `.env.vercel.production`

3. Deploy company Vercel project.
4. Deploy resume Vercel project.
5. Verify:
   - company auth restrictions
   - resume public registration
   - categories / rules / SEO banks
   - per-copy image role generation
   - image signing

## Branding

Visible product names should now be:

- company: `DLM AI`
- resume: `Listing Studio`

Do not reintroduce the old product name or banana icon in:

- navbar
- login screen
- metadata
- app icon
- README
- public demo copy

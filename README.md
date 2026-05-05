# Nano Listing AI

AI-powered ecommerce listing generation workflow built with Next.js, Supabase, Gemini image/text generation, and Vercel.

Nano Listing AI is designed for cross-border ecommerce listing work such as Shopee and TikTok Shop. It helps teams manage products, category prompts, platform rules, multilingual copies, generated images, and employee listing progress in one place.

## Live Demo

Public resume/demo edition:

[https://nano-banana-web-resume.vercel.app](https://nano-banana-web-resume.vercel.app)

Internal company edition is deployed separately with authorization-based access control.

## Core Features

- Product master table with SKU, source title, source description, category, selling points, custom attributes, and reference images.
- Excel / CSV batch import with automatic field mapping.
- Category prompt management for ecommerce image generation.
- Multilingual product copy generation.
- Per-copy image generation selection.
- Employee workbench for listing status, store name, notes, and follow-up actions.
- Batch operations for outputs.
- Supabase-backed auth, storage, and persistence.
- Vercel deployment with Next.js App Router APIs.

## Image Generation Model

The app now uses a 3-role image workflow instead of a fixed 6-image workflow:

- `main`: main product image
- `scene`: lifestyle / usage scene image
- `detail`: product detail image

Each language copy can independently choose which image roles to generate.

Examples:

- English 1: `main`
- English 2: `main + detail`
- Malay 1: `scene`

If a product is configured with `English count = 2`, the system creates two separate copies such as `English 1` and `English 2`, each with its own selected image plan.

## Editions

This repository supports two deployment editions through environment variables.

### Company Edition

Set:

```bash
APP_EDITION=company
NEXT_PUBLIC_APP_EDITION=company
```

Behavior:

- Registration and login are authorization-based.
- Only approved internal emails can access and use the system.
- Removing authorization blocks future login.

### Resume Edition

Set:

```bash
APP_EDITION=resume
NEXT_PUBLIC_APP_EDITION=resume
```

Behavior:

- Public registration is enabled.
- AI generation still requires either:
  - the built-in API password, or
  - the user's own API key.

## Main Pages

- `/login`: sign in
- `/`: products workbench
- `/categories`: category prompt management
- `/categories/[id]`: category prompt detail
- `/product-outputs`: generated listing outputs
- `/product-outputs/[id]`: output detail page
- `/rules`: platform and compliance rules
- `/settings`: model and API settings
- `/dashboard`: operations dashboard

## Generation Logic

1. Create or import products into the product master table.
2. Select a category for the product.
3. Upload one or more reference images.
4. Configure language copy counts.
5. Configure image-role selection for each copy.
6. The system merges product data, category prompts, copy plan, language, and active rules into generation prompts.
7. Gemini generates title and description.
8. The system creates only the selected image tasks for each copy.
9. Outputs are grouped by SKU, language, copy index, and generation time.

## Database Setup

Run these SQL files in Supabase SQL Editor for a fresh environment:

```bash
supabase/schema.sql
supabase/builtin_key_authorizations.sql
supabase/product_workflow.sql
supabase/20260503_workbench_quality.sql
```

Optional hardening, recommended after core verification:

```bash
supabase/20260503_workspace_rls_hardening.sql
```

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<optional-built-in-password>
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_EDITION=company
NEXT_PUBLIC_APP_EDITION=company
```

## Deployment

Recommended deployment model:

- One codebase
- Two Vercel projects
- Company edition and resume edition split by environment variables

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<optional-built-in-password>
NEXT_PUBLIC_APP_URL=<your-production-url>
APP_EDITION=<company|resume>
NEXT_PUBLIC_APP_EDITION=<company|resume>
```

After changing environment variables or schema, redeploy the project on Vercel.

# Nano Banana Web

An AI image generation web app for e-commerce product visuals, built with Next.js, Supabase, and Google Gemini 2.5 Flash Image.

## Live Demo

https://nano-banana-web-zeta.vercel.app

## Overview

Nano Banana Web helps users organize product image generation workflows by category. New accounts are initialized with preset beauty and personal-care categories and prompt templates, so users can start by uploading product images, selecting categories, and running batch generation jobs.

The app supports both standard Gemini image generation and Gemini Batch API mode for lower-cost asynchronous generation.

## Features

- User registration and login with account-level data isolation
- 23 preset beauty and personal-care categories for every new user
- Category-level prompt management with automatic prompt numbering
- Product image upload and management per category
- Multi-category batch job creation
- Frozen job snapshots, so historical jobs are not affected by later prompt or image changes
- Gemini 2.5 Flash Image standard mode for faster small jobs
- Gemini Batch API mode for lower-cost asynchronous generation
- Built-in Gemini API key access with password protection, plus user-owned API key support
- Job status tracking and cancellable active jobs
- Output gallery with filtering by category, date, prompt number, and image name

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend and API | Next.js 14, App Router, React, TypeScript |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File Storage | Supabase Storage |
| AI Generation | Google Gemini 2.5 Flash Image, Gemini Batch API |
| Deployment | Vercel |

## Architecture

The application is deployed as a Vercel-hosted Next.js app. Supabase provides authentication, relational data storage, row-level security, and private image/output storage.

Each user owns their own categories, prompts, uploaded product images, jobs, and generated outputs. Preset categories are seeded automatically for each user, then can be customized independently.

## Main Pages

| Page | Path | Purpose |
| --- | --- | --- |
| Login | `/login` | Register and sign in |
| Dashboard | `/` | View preset/custom categories and start selected jobs |
| Category Detail | `/category/[slug]` | Manage prompts and product images |
| Jobs | `/jobs` | Track generation jobs and inspect snapshots/items |
| Outputs | `/outputs` | Browse and filter generated images |
| Settings | `/settings` | Configure API key and generation mode |

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Create a `.env.local` file for local development:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<optional-built-in-key-password>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Setup

Run the SQL migration in `supabase/schema.sql` inside the Supabase SQL Editor.

The main tables are:

- `profiles`
- `categories`
- `category_prompts`
- `category_images`
- `jobs`
- `job_snapshots`
- `job_items`
- `outputs`
- `system_settings`

## Deployment

The production app is deployed on Vercel. Required production environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
NEXT_PUBLIC_APP_URL=<your-production-url>
```

Optional environment variables for the password-protected built-in Gemini key:

```bash
BUILTIN_GEMINI_API_KEY=<gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<access-password>
```

After changing Vercel environment variables, redeploy the project so server-side functions receive the latest values.

## Notes

- New users automatically receive the preset categories and prompts.
- Uploaded product images are private and scoped to the current user.
- Batch jobs are asynchronous; completion time depends on Gemini Batch API processing.
- Standard mode is useful for small, time-sensitive runs, while Batch mode is designed for lower-cost bulk generation.

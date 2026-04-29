# Nano Banana Web / Nano Banana 生图系统

An AI image generation web app for e-commerce product visuals, built with Next.js, Supabase, Google Gemini 2.5 Flash Image, and admin-only OpenAI GPT Image 2.

一个面向电商产品图生成场景的 AI Web 应用，基于 Next.js、Supabase、Google Gemini 2.5 Flash Image 和管理员专用 OpenAI GPT Image 2 构建。

## Live Demo / 在线体验

https://nano-banana-web-zeta.vercel.app

## Overview / 项目概览

Nano Banana Web helps users organize product image generation workflows by category. New accounts are automatically initialized with preset beauty and personal-care categories and prompt templates, so users can start by uploading product images, selecting categories, and running generation jobs.

Nano Banana Web 用于按类目组织电商产品图生成流程。新用户注册后会自动获得预置的美妆个护类目和对应 Prompt 模板，用户只需要上传产品图、选择类目并运行任务，即可批量生成商品视觉图。

The app supports standard and Batch image generation with Gemini, plus admin-only standard and Batch generation with OpenAI GPT Image 2. It also includes a built-in AI prompt generator that turns short user briefs into structured e-commerce image prompts.

系统支持 Gemini 普通即时生成模式和成本更低的 Gemini Batch API 异步批量生成模式；管理员还可以切换使用 OpenAI GPT Image 2 的普通模式或 Batch 模式。同时内置 AI Prompt 生成器，可将用户输入的简单关键词扩展为结构化电商生图 Prompt。

## Features / 功能亮点

- User registration and login with account-level data isolation  
  用户注册/登录，所有数据按账号隔离

- 23 preset beauty and personal-care categories for every new user  
  每个新用户自动初始化 23 个美妆个护类目

- Category-level prompt management with automatic prompt numbering  
  支持按类目管理 Prompt，并自动维护 P1、P2、P3 等编号

- Category creation and deletion, including removable preset categories  
  支持新增和删除类目，预置类目也可以删除

- AI-assisted prompt generation from short product/style briefs  
  支持根据产品类型、图片风格、展示方式等简单描述自动生成 Prompt

- Product image upload and management per category  
  每个类目可独立上传和管理产品图片

- Multi-category batch job creation  
  支持勾选多个类目后一键创建批量生成任务

- Frozen job snapshots, so historical jobs are not affected by later configuration changes  
  任务快照会冻结运行时配置，历史任务不受后续 Prompt 或图片变更影响

- Gemini 2.5 Flash Image standard mode for faster small jobs  
  支持 Gemini 2.5 Flash Image 普通模式，适合少量图片快速生成

- Gemini Batch API mode for lower-cost asynchronous generation  
  支持 Gemini Batch API 半价异步模式，适合批量生成

- Built-in Gemini API key access through authorized emails or password protection, plus user-owned API key support  
  支持授权邮箱免密码使用内置 Gemini API Key，也支持输入访问密码或使用用户自备 Key

- Admin page for managing authorized emails for built-in key and AI prompt generation access  
  提供管理员页面，用于添加、取消、恢复内置 Key 和 AI Prompt 生成功能的授权邮箱

- Admin-only standard generation mode; authorized staff accounts are limited to Batch mode  
  普通即时生成模式仅管理员可用；被授权员工账号只开放 Batch 半价模式

- Admin-only OpenAI GPT Image 2 provider with standard and Batch modes  
  管理员可切换 OpenAI GPT Image 2，并使用普通模式或 Batch 模式

- Job status tracking and cancellable active jobs  
  支持任务状态追踪和运行中任务取消

- Output gallery with filtering by category, date, prompt number, and image name  
  输出图库支持按类目、日期、Prompt 编号和图片名称筛选

## Tech Stack / 技术栈

| Layer / 模块 | Technology / 技术 |
| --- | --- |
| Frontend and API / 前端与接口 | Next.js 14, App Router, React, TypeScript |
| Database / 数据库 | Supabase PostgreSQL |
| Authentication / 用户认证 | Supabase Auth |
| File Storage / 文件存储 | Supabase Storage |
| AI Generation / AI 生成 | Google Gemini 2.5 Flash Image, Gemini Batch API, OpenAI GPT Image 2, OpenAI Batch API, Gemini text model for prompt generation |
| Deployment / 部署 | Vercel |

## Architecture / 架构说明

The application is deployed as a Vercel-hosted Next.js app. Supabase provides authentication, relational data storage, row-level security, and private image/output storage.

该应用部署在 Vercel 上，使用 Supabase 提供用户认证、关系型数据存储、行级安全策略以及私有图片/输出文件存储。

Each user owns their own categories, prompts, uploaded product images, jobs, and generated outputs. Preset categories are seeded automatically for each new user and can then be customized or deleted independently.

每个用户拥有独立的类目、Prompt、上传图片、任务和输出结果。预置类目会在新用户注册时自动初始化，之后用户可以独立修改或删除，不影响其他账号。

Built-in Gemini API access is controlled on the server side. A user can use the built-in key only if their email is authorized by an admin or if they have verified the access password. The same authorization logic also protects AI prompt generation.

内置 Gemini API Key 的权限会在服务端校验。用户只有在邮箱被管理员授权，或输入过正确访问密码后，才能使用内置 Key；AI 自动生成 Prompt 功能也复用同一套授权逻辑。

## Main Pages / 主要页面

| Page / 页面 | Path / 路径 | Purpose / 功能 |
| --- | --- | --- |
| Login / 登录 | `/login` | Register and sign in / 注册与登录 |
| Dashboard / 首页 | `/` | View categories and start selected jobs / 查看类目并启动选中任务 |
| Category Detail / 类目详情 | `/category/[slug]` | Manage prompts and product images / 管理 Prompt 和产品图片 |
| Jobs / 任务中心 | `/jobs` | Track jobs and inspect snapshots/items / 查看任务状态、快照和任务项 |
| Outputs / 输出图库 | `/outputs` | Browse and filter generated images / 浏览和筛选生成结果 |
| Settings / 设置 | `/settings` | Configure API key and generation mode / 配置 API Key 与生成模式 |
| Authorized Emails / 授权邮箱管理 | `/admin/authorized-emails` | Admin-only built-in key access management / 管理员管理内置 Key 授权邮箱 |

## Local Development / 本地开发

```bash
npm install
npm run dev
```

Open http://localhost:3000.

访问 http://localhost:3000。

Create a `.env.local` file for local development:

本地开发需要创建 `.env.local` 文件：

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<optional-built-in-key-password>
PROMPT_GENERATOR_MODEL=<optional-prompt-generator-model>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Setup / 数据库配置

Run the SQL migration in `supabase/schema.sql` inside the Supabase SQL Editor. To enable authorized-email access for the built-in key, also run `supabase/builtin_key_authorizations.sql`.

在 Supabase SQL Editor 中执行 `supabase/schema.sql` 里的数据库迁移脚本。如需启用内置 Key 的授权邮箱功能，还需要执行 `supabase/builtin_key_authorizations.sql`。

Main tables / 主要数据表：

- `profiles`
- `categories`
- `category_prompts`
- `category_images`
- `jobs`
- `job_snapshots`
- `job_items`
- `outputs`
- `system_settings`
- `builtin_key_authorizations`

## Deployment / 部署

The production app is deployed on Vercel. Required production environment variables:

生产环境部署在 Vercel，需要配置以下环境变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
NEXT_PUBLIC_APP_URL=<your-production-url>
```

Optional environment variables for the password-protected built-in Gemini key:

如需启用密码保护的内置 Gemini Key，可额外配置：

```bash
BUILTIN_GEMINI_API_KEY=<gemini-api-key>
BUILTIN_KEY_ACCESS_PASSWORD=<access-password>
PROMPT_GENERATOR_MODEL=gemini-3-flash-preview
```

Optional environment variables for admin-only OpenAI GPT Image 2:

如需启用管理员专用 OpenAI GPT Image 2，可额外配置：

```env
OPENAI_API_KEY=<openai-secret-key>
OPENAI_IMAGE_MODEL=gpt-image-2
```

After changing Vercel environment variables, redeploy the project so server-side functions receive the latest values.

修改 Vercel 环境变量后，需要重新部署项目，服务端函数才会读取到最新配置。

## Notes / 说明

- New users automatically receive the preset categories and prompts once during account setup. Existing users can delete preset categories without them being recreated on refresh.  
  新用户会在账号初始化时自动获得预置类目和 Prompt。已有用户删除预置类目后，刷新页面不会再次自动恢复。

- AI prompt generation is available only to users with authorized-email access or verified built-in-key password access.  
  AI 自动生成 Prompt 仅对已授权邮箱用户，或已输入正确内置 Key 访问密码的用户开放。

- Uploaded product images are private and scoped to the current user.  
  用户上传的产品图是私有的，并且只属于当前账号。

- Batch jobs are asynchronous; completion time depends on Gemini Batch API or OpenAI Batch API processing.  
  Batch 任务为异步执行，完成时间取决于 Gemini Batch API 或 OpenAI Batch API 的处理速度。

- Standard mode is useful for small, time-sensitive runs, while Batch mode is designed for lower-cost bulk generation.  
  普通模式适合少量、需要快速看到结果的任务，仅管理员可启用；Batch 模式适合成本更低的批量生成，也是授权员工账号的默认可用模式。

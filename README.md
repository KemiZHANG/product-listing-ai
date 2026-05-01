# Nano Listing AI 电商 AIGC 商品素材生成系统

An AI-powered ecommerce listing content generation platform built with Next.js, Supabase, Gemini / Nano Banana image generation workflow, and Vercel.

一个面向 Shopee/TikTok 等跨境电商上品场景的 AIGC Web 系统，用于管理商品资料、类目 Prompt、平台规则、多语言副本，并批量生成商品图、标题和描述。

## Live Demo / 在线地址

https://nano-banana-web-zeta.vercel.app

> Current access is temporarily restricted to the project owner account during product iteration.
>
> 当前版本处于优化阶段，暂时仅开放指定账号登录使用。

## Project Overview / 项目概览

Nano Listing AI turns the ecommerce listing workflow into a structured generation pipeline. Users can maintain a product master table with SKU, original title, description, category, selling points, custom attributes, and reference images. The system then generates language-specific listing copies and image tasks based on category prompts and editable compliance rules.

Nano Listing AI 将电商上品流程拆解为结构化 AIGC 工作流：用户维护商品总表，录入 SKU、原标题、原描述、类目、卖点、自定义属性和多张参考图；系统根据类目 Prompt 与可编辑平台规则，自动生成不同语言/副本的商品标题、描述和 6 张商品图任务。

## Core Features / 核心功能

- Product master table with unique SKU, source title, source description, category selection, selling points, languages, copy count, and custom global attributes.
- 商品总表管理：支持唯一 SKU、原标题、原描述、类目选择、卖点、目标语言、副本数量和全局自定义属性。

- Excel/CSV import for batch product data ingestion, including automatic mapping of common field names and custom attributes.
- 支持 Excel/CSV 批量导入商品信息，可自动映射常见字段，并将未知列作为自定义属性。

- Multi-reference image upload per product; all source images can be used as generation references.
- 每个商品支持上传多张原始参考图，生图时可作为统一参考素材。

- Editable category prompt system with 23 preset categories and a 6-image ecommerce structure.
- 支持 23 个预置类目和可编辑 Prompt；每个类目默认维护 6 类图片指令。

- Six-image workflow: main image 1, main image 2, model/usage scene 1, model/usage scene 2, product detail image 1, product detail image 2.
- 六图生成结构：主图 1、主图 2、模特/使用场景图 1、模特/使用场景图 2、商品详情图 1、商品详情图 2。

- Multi-language copy generation for English, Malay, Filipino, Indonesian, Thai, and Vietnamese.
- 支持英语、马来语、菲律宾语、印尼语、泰语、越南语等多语言商品副本。

- Each product copy keeps generated title, description, and image tasks together, with detail pages for review and download.
- 每个商品副本将标题、描述和图片任务聚合展示，可进入详情页查看、复制文案并下载图片。

- Editable rule templates extracted from Shopee title, description, image, and compliance guidelines.
- 支持基于 Shopee 标题、描述、图片和合规红线的可编辑规则模板。

- Supabase-backed authentication, row-level data isolation, database persistence, and private image/output storage.
- 基于 Supabase 实现用户认证、行级数据隔离、数据库持久化和私有图片/结果存储。

- Deployed on Vercel with Next.js App Router API routes.
- 基于 Vercel 部署，使用 Next.js App Router 与 Route Handlers 构建前后端一体化应用。

## Generation Logic / 生成逻辑

1. Create or import products into the product master table.
2. Select a preset or custom category for each product.
3. Upload one or more original reference images for the product.
4. Configure copy count and target languages.
5. The system merges product data, category prompts, selected language, copy index, and active rule templates into generation prompts.
6. Gemini generates listing title/description, while image tasks are created for the six-image product visual workflow.
7. Output copies are grouped by SKU, language, copy index, category, and generation time.

## Architecture / 架构说明

| Layer / 模块 | Technology / 技术 |
| --- | --- |
| Frontend / 前端 | Next.js 14 App Router, React, TypeScript, Tailwind CSS |
| API / 接口 | Next.js Route Handlers |
| Database / 数据库 | Supabase PostgreSQL |
| Auth / 认证 | Supabase Auth |
| Storage / 文件存储 | Supabase Storage |
| AI Text Generation / 文案生成 | Gemini text model |
| AI Image Generation / 图片生成 | Gemini 2.5 Flash Image / Nano Banana workflow |
| Batch Import / 批量导入 | xlsx |
| Deployment / 部署 | Vercel |

## Main Pages / 主要页面

| Page / 页面 | Path / 路径 | Purpose / 功能 |
| --- | --- | --- |
| Login / 登录 | `/login` | Sign in with restricted project access / 指定账号登录 |
| Products / 商品工作台 | `/` | Product table, image upload, Excel import, batch generation / 商品表、原图上传、Excel 导入、批量生成 |
| Categories / 类目管理 | `/categories` | Manage categories and six-prompt structure / 管理类目与 6 条生图指令 |
| Category Detail / 类目详情 | `/categories/[id]` | Edit prompts by role / 按图片角色编辑 Prompt |
| Product Outputs / 商品副本输出 | `/product-outputs` | Filter generated copies by SKU/category/language/date / 按 SKU、类目、语言、时间筛选副本 |
| Output Detail / 副本详情 | `/product-outputs/[id]` | View title, description, reference images, generated images / 查看标题、描述、原图与生成图 |
| Rules / 规则模板 | `/rules` | Edit platform, title/description, and image rules / 编辑平台、标题描述和图片规则 |
| Settings / 设置 | `/settings` | Configure model/API settings / 配置模型与 API |

## Database Setup / 数据库配置

Run the base schema and product workflow schema in Supabase SQL Editor:

在 Supabase SQL Editor 中执行基础表结构和商品工作流表结构：

```bash
supabase/schema.sql
supabase/builtin_key_authorizations.sql
supabase/product_workflow.sql
```

Product workflow tables include:

- `product_attribute_columns`
- `products`
- `product_images`
- `rule_templates`
- `product_copies`
- `product_copy_images`
- `category_prompts.prompt_role`

## Local Development / 本地开发

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Create a `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Deployment / 部署

The production app is deployed on Vercel. Required production environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
NEXT_PUBLIC_APP_URL=<your-production-url>
BUILTIN_GEMINI_API_KEY=<optional-gemini-api-key>
```

After changing environment variables or database schema, redeploy the project on Vercel.

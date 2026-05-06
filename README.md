# DLM AI

## 中文版说明

### 项目简介

`DLM AI` 是一个电商商品工作台，支持商品管理、类目 Prompt、商品标题与描述生成、图片生成、图片重生、SEO 关键词库、规则库和上品状态管理。

这个仓库当前服务两套站点：

- 公司内部版：仅授权邮箱可注册、登录和使用
- 简历公开版：允许公开注册，使用独立 Supabase 和独立 Vercel 项目

两套站点共用一份代码，通过环境变量切换 edition。

### 核心能力

- 商品创建、编辑、导入
- 每个语言副本独立配置图片类型
- 三图模型：`main`、`scene`、`detail`
- 标题、描述、图片生成
- 图片失败重试、单张重生、待确认新图审核
- SEO 关键词库管理
- Rules 规则库管理
- 公司版授权邮箱控制

### 环境划分

公司内部版：

- `APP_EDITION=company`
- 使用公司 Supabase
- 使用公司 Vercel
- 仅授权邮箱可访问

简历公开版：

- `APP_EDITION=resume`
- 使用简历版 Supabase
- 使用简历版 Vercel
- 允许公开注册

### 关键环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
APP_EDITION=
NEXT_PUBLIC_APP_EDITION=
BUILTIN_GEMINI_API_KEY=
BUILTIN_KEY_ACCESS_PASSWORD=
```

### 本地运行

```bash
npm install
npm run dev
npm run build
```

### 数据库 SQL

新环境需要执行：

```bash
supabase/schema.sql
supabase/product_workflow.sql
supabase/builtin_key_authorizations.sql
supabase/20260503_image_regeneration_review.sql
supabase/20260503_workbench_quality.sql
```

暂时不要执行：

```bash
supabase/20260503_workspace_rls_hardening.sql
```

### 参考数据同步

当公司版新增类目、Prompt、Rules、SEO 词库后，可以把演示需要的参考数据同步到简历版：

```bash
npm run sync:resume-reference-data
```

### 历史 6 图数据清理

仓库内置了旧数据清理脚本，可用于把历史 6 图痕迹收口到 3 图模型：

```bash
npm run cleanup:legacy-six-image-data -- --mode=tasks-only
```

常用参数：

- `--mode=tasks-only`
- `--mode=tasks-and-prompts`
- `--workspace=all|internal|external`
- `--env-file=...`
- `--backup-dir=...`
- `--execute`

默认先 dry-run，并输出备份。

### 稳定性说明

当前代码已经补了这些基础能力：

- 公司版登录后持续校验授权状态
- 失去授权后前端会强制退回登录页
- 列表页会在聚焦、切回标签页和固定间隔时刷新数据
- 图片 signed URL 统一走服务端接口，降低多人访问时的加载失败概率
- 商品页、副本页、Rules 页已经接入 Supabase Realtime 自动刷新

### 部署流程

```bash
1. 在主仓库完成代码修改
2. 运行 npm run build
3. 同步简历版部署目录
4. 部署公司版 Vercel
5. 部署简历版 Vercel
6. 验证授权、类目、SEO、图片加载和副本生成
```

### 交接文档

- `docs/HANDOFF.md`

---

## English Version

### Overview

`DLM AI` is an ecommerce listing workspace built with Next.js, Supabase, Gemini, OpenAI image generation, and Vercel. It supports product management, category prompt management, title and description generation, image generation, image regeneration review, SEO keyword banks, reusable rule templates, and listing status operations.

This repository currently serves two separate deployments:

- Company edition: authorized internal access only
- Resume edition: public registration with isolated Supabase and Vercel projects

Both editions share one codebase and switch behavior through environment variables.

### Core Features

- Product creation, editing, and import
- Per-copy image role selection for each language copy
- Three-image model: `main`, `scene`, `detail`
- AI title, description, and image generation
- Failed image retry, single-image regeneration, pending-image review
- SEO keyword bank management
- Rules library management
- Company-only authorization workflow

### Editions

Company edition:

- `APP_EDITION=company`
- Uses the company Supabase project
- Uses the company Vercel project
- Authorized emails only

Resume edition:

- `APP_EDITION=resume`
- Uses the resume Supabase project
- Uses the resume Vercel project
- Public registration enabled

### Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
APP_EDITION=
NEXT_PUBLIC_APP_EDITION=
BUILTIN_GEMINI_API_KEY=
BUILTIN_KEY_ACCESS_PASSWORD=
```

### Local Development

```bash
npm install
npm run dev
npm run build
```

### Required SQL

Run these files for a fresh environment:

```bash
supabase/schema.sql
supabase/product_workflow.sql
supabase/builtin_key_authorizations.sql
supabase/20260503_image_regeneration_review.sql
supabase/20260503_workbench_quality.sql
```

Do not run yet:

```bash
supabase/20260503_workspace_rls_hardening.sql
```

### Reference Data Sync

When the company edition receives new categories, prompts, rules, or SEO banks, sync the required reference data to the resume edition with:

```bash
npm run sync:resume-reference-data
```

### Legacy 6-Image Cleanup

The repository includes a cleanup script for legacy 6-image-era data:

```bash
npm run cleanup:legacy-six-image-data -- --mode=tasks-only
```

Useful options:

- `--mode=tasks-only`
- `--mode=tasks-and-prompts`
- `--workspace=all|internal|external`
- `--env-file=...`
- `--backup-dir=...`
- `--execute`

The default behavior is dry-run with backup output first.

### Stability Notes

The current codebase already includes:

- ongoing company-edition access checks after login
- forced client sign-out when authorization is revoked
- focus, visibility, and interval-based data refresh on key list pages
- server-backed signed URL generation for more reliable shared image access
- Supabase Realtime refresh on products, outputs, and rules pages

### Deployment Flow

```bash
1. Finish code changes in the main repository
2. Run npm run build
3. Sync the resume deployment mirror
4. Deploy the company Vercel project
5. Deploy the resume Vercel project
6. Verify auth, categories, SEO, image loading, and copy generation
```

### Handoff

- `docs/HANDOFF.md`

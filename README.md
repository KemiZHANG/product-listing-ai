# Nano Banana 生图系统

基于 Next.js 14 + Supabase + Gemini API 的电商产品图片自动生成 Web 应用。

## 功能

- 23 个预置美妆个护类目，支持自由新增
- 每个类目独立管理 prompts（P1, P2, P3... 自动重排）和产品图片
- 一键勾选多个类目批量运行
- 任务快照冻结，历史任务不受配置变更影响
- 输出图片按类目、日期、P 编号、SKU 多维度筛选
- 内置 Gemini API Key（密码保护）或用户自备 Key

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 + 后端 | Next.js 14 (App Router) |
| 数据库 | Supabase PostgreSQL |
| 用户认证 | Supabase Auth |
| 文件存储 | Supabase Storage |
| 执行引擎 | Google Gemini 2.5 Flash Image API |
| 部署 | Vercel |

## 本地开发

```bash
cd nano-banana-web
npm install
npm run dev
```

访问 http://localhost:3000

## 部署步骤

> 你的 Supabase 项目已创建：https://ytphdxldfifgafvypyuz.supabase.co

### 1. 配置 Supabase 数据库（立刻执行）

1. 登录 [supabase.com](https://supabase.com) → 进入你的项目
2. 进入 **SQL Editor**
3. 点击 **New Query**，复制粘贴 `supabase/schema.sql` 的全部内容，点击 **Run**
4. 进入 **Settings > API**，获取：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` = `https://ytphdxldfifgafvypyuz.supabase.co`
   - `Project API keys` 中的 `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

### 2. 填写环境变量

在项目根目录创建 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ytphdxldfifgafvypyuz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<从 Supabase Settings > API 获取>
SUPABASE_SERVICE_ROLE_KEY=<从 Supabase Settings > API 获取>
BUILTIN_GEMINI_API_KEY=<你的 Gemini API Key，base64 编码>
BUILTIN_KEY_ACCESS_PASSWORD=<你的访问密码>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 本地启动测试

```bash
cd nano-banana-web
npm install
npm run dev
```

访问 http://localhost:3000 → 注册账号 → 登录

### 4. 导入 23 个预置类目和 Prompts

注册登录后，用你的用户 ID 运行导入脚本：

```bash
npx tsx scripts/import-categories.ts <你的用户ID>
```

用户 ID 在 Supabase Dashboard → Authentication → Users 中查看。

### 5. 部署到 Vercel

1. 登录 [vercel.com](https://vercel.com)
2. 点击 **Add New... → Project**
3. 选择 **Import Third-Party Git Repository** → 选你的 Git 仓库（需先把项目上传到 GitHub/GitLab）
   或者直接用 Vercel CLI 部署：
   ```bash
   npm i -g vercel
   vercel
   ```
4. 在 Vercel 项目设置中添加所有环境变量（第 2 步的那些）
5. 部署完成后，`NEXT_PUBLIC_APP_URL` 改为实际的 Vercel 域名

## 环境变量说明

| 变量 | 说明 | 必需 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 公开 anon key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端 key（保密） | 是 |
| `BUILTIN_GEMINI_API_KEY` | 内置 Gemini API Key（base64 编码） | 否 |
| `BUILTIN_KEY_ACCESS_PASSWORD` | 内置 Key 的访问密码 | 否 |
| `NEXT_PUBLIC_APP_URL` | 应用 URL | 是 |

## 数据库表结构

- `profiles` - 用户扩展信息
- `categories` - 类目（name_zh 中文名 + slug 英文标识）
- `category_prompts` - 类目 prompts（自动连续编号）
- `category_images` - 类目产品图片
- `jobs` - 任务（状态追踪）
- `job_snapshots` - 任务快照（冻结运行时配置）
- `job_items` - 任务项（图片 x Prompt 组合）
- `outputs` - 输出记录
- `system_settings` - 用户系统设置

## 输出命名规则

```
{显示名}_P{编号}_{日期}_{序号}.png
例：ABC123_P1_2026-04-24_01.png
```

## 页面说明

| 页面 | 路径 | 功能 |
|------|------|------|
| 登录 | `/login` | 注册/登录 |
| 首页 | `/` | 23 类目卡片、勾选运行、新建类目 |
| 类目详情 | `/category/[slug]` | Prompt 管理、图片管理、运行 |
| 任务中心 | `/jobs` | 任务列表、状态追踪、详情查看 |
| 输出图库 | `/outputs` | 输出图展示、多维筛选 |
| 设置 | `/settings` | API Key 管理、模式切换 |

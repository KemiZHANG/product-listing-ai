# Product Listing AI

## 中文版

### Product Listing AI 是什么

`Product Listing AI` 是一个面向电商运营场景的 AI 商品工作台，用来把商品整理、文案生成、图片生成、SEO 关键词管理和规则管理放到同一个系统里完成。

它适合需要长期处理商品资料、重复生成商品标题与描述、制作商品图、维护关键词库和统一运营规范的使用场景。相比把这些工作分散在表格、聊天工具和多个 AI 页面里，`Product Listing AI` 更强调流程统一、结果可追踪和多人协作。

### 在线体验

- [https://product-listing-ai.vercel.app](https://product-listing-ai.vercel.app)

### 主要功能

- 商品管理：创建、编辑、导入商品基础资料
- 多语言副本生成：按商品生成不同语言版本的标题与描述
- 图片工作流：支持主图、场景图、详情图的生成与管理
- 图片重生与审核：支持单张重生、失败重试、候选新图确认
- SEO 关键词库：按类目与语言维护关键词，支持导入导出与 AI 补全
- Rules 规则库：集中管理文案、图片、平台规范和生成约束
- 输出工作台：集中查看生成结果、筛选状态、跟进上品进度

### 内部逻辑

`Product Listing AI` 的核心不是“单次调用一个模型”，而是把商品生成过程做成一个可重复执行的工作流。

1. 用户先录入或导入商品资料，包括 SKU、标题、描述、类目、卖点和参考图。
2. 系统根据商品所属类目，读取对应的 Prompt 配置、SEO 关键词和规则约束。
3. 用户为不同语言副本配置生成计划，并决定每个副本需要哪些图片类型。
4. 文本生成模块会把商品资料、类目提示、规则库和关键词上下文拼装成结构化提示词，再生成标题与描述。
5. 图片生成模块会根据副本配置拆分出独立图片任务，分别处理主图、场景图和详情图。
6. 所有生成结果、状态变化、审核动作和备注都会写回数据库，形成可追踪的输出记录。
7. 页面层通过服务端签名图片地址、自动刷新和实时同步机制，让多人打开同一页面时看到尽量一致的数据状态。

这套逻辑的重点在于把 AI 从“聊天式单次输出”变成“有输入、有约束、有结果沉淀”的业务系统。

### 怎么使用

1. 进入系统后先创建商品，或者通过表格批量导入商品资料。
2. 为商品选择类目，并上传参考图片。
3. 配置需要生成的语言副本，以及每个副本对应的图片类型。
4. 触发生成后，系统会自动产出标题、描述和图片任务。
5. 在输出页查看结果，处理失败任务，确认候选新图，补充备注或上品状态。
6. 在 SEO Keywords 和 Rules 页面持续维护关键词与规范，让后续生成越来越稳定。

### 用到了哪些专业知识

这个项目背后涉及的不只是前端页面搭建，还包含一整套偏产品化和工程化的能力：

- `Next.js App Router`：负责页面路由、服务端接口和前后端一体化开发
- `TypeScript`：保证接口、数据结构和复杂状态管理更稳定
- `Supabase`：承担数据库、认证、对象存储和实时同步能力
- `Prompt Engineering`：把商品信息、规则、类目和关键词组织成高质量提示词
- `Structured Output`：约束模型输出格式，减少脏数据和不可控内容
- `SEO 数据建模`：将关键词按类目、语言、类型进行结构化管理
- `图片工作流设计`：把图片生成、审核、重试、确认拆成可追踪步骤
- `多人协作一致性`：通过状态落库、签名 URL、自动刷新和 Realtime 保持页面同步

### 在实际生活中的用处

如果一个人或一个团队每天都要处理很多商品，这个系统能直接节省大量重复劳动：

- 减少手动写标题和描述的时间
- 降低多人协作时资料分散、版本不一致的问题
- 让图片生成和审核流程更清楚，不容易漏图或重复返工
- 提前把 SEO 关键词和规则纳入生成逻辑，提高内容一致性
- 让商品从“原始资料”到“可发布结果”的过程更标准化

对跨境电商、内容运营、商品整理、AI 辅助上品这类场景来说，这种工作台比单独使用聊天机器人更接近真实工作方式。

### 技术栈

- Next.js 14
- React
- TypeScript
- Supabase
- Vercel
- Gemini / OpenAI Image

### 本地运行

```bash
npm install
npm run dev
npm run build
```

### 常用环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
BUILTIN_GEMINI_API_KEY=
BUILTIN_KEY_ACCESS_PASSWORD=
```

---

## English Version

### What Product Listing AI Is

`Product Listing AI` is an AI-powered ecommerce listing workspace designed to manage product data, generate copy, create images, maintain SEO keyword banks, and organize reusable operating rules in one system.

It is built for real product operations work where teams repeatedly prepare listings, refine titles and descriptions, generate visual assets, and keep content quality consistent over time. Instead of scattering the workflow across spreadsheets, chat tools, and isolated AI prompts, `Product Listing AI` turns it into a structured operating workspace.

### Live Site

- [https://product-listing-ai.vercel.app](https://product-listing-ai.vercel.app)

### Core Features

- Product management for creating, editing, and importing product records
- Multilingual copy generation for titles and descriptions
- Image workflow for main images, scene images, and detail images
- Single-image regeneration, failed-task retry, and candidate-image confirmation
- SEO keyword bank management with import, export, and AI-assisted drafting
- Reusable rules library for copy, image, and platform constraints
- Output workbench for reviewing generated results and tracking listing status

### Internal Logic

The core value of `Product Listing AI` is that it turns AI generation into a repeatable product workflow rather than a one-off prompt.

1. Users create or import product records with SKU, title, description, category, selling points, and reference images.
2. The system loads the related category prompts, SEO keyword context, and active rules.
3. Users configure language copies and choose which image roles each copy should generate.
4. The text generation layer combines product data, prompt templates, rules, and keyword context into structured prompts for title and description generation.
5. The image generation layer expands each copy into separate image tasks for `main`, `scene`, and `detail` outputs.
6. Generated content, review actions, notes, and status updates are persisted in the database.
7. Signed image URLs, auto-refresh behavior, and realtime updates help multiple users see consistent data on shared pages.

This makes the system much more useful in real operations work: AI outputs are no longer isolated answers, but part of a managed workflow with traceable state.

### How To Use It

1. Create a product or import product data in bulk.
2. Assign a category and upload reference images.
3. Configure language copies and choose the image roles for each copy.
4. Trigger generation to produce titles, descriptions, and image tasks.
5. Review outputs, retry failed tasks, confirm replacement images, and update notes or listing status.
6. Maintain the SEO Keywords and Rules pages so future generations become more stable and consistent.

### Professional Skills Behind It

This project combines product thinking with engineering discipline:

- `Next.js App Router` for page routing, APIs, and full-stack application structure
- `TypeScript` for safer data contracts and state handling
- `Supabase` for database, auth, storage, and realtime infrastructure
- `Prompt engineering` for combining product context, category guidance, keywords, and rules
- `Structured output design` to reduce malformed model responses
- `SEO data modeling` for language-aware, category-aware keyword management
- `Image workflow design` for generation, retry, review, and confirmation states
- `Collaborative state synchronization` through persistence, signed URLs, refresh patterns, and realtime events

### Real-World Value

In practical use, `Product Listing AI` helps individuals and teams:

- spend less time manually writing listing copy
- reduce inconsistency across product records and generated outputs
- manage image generation and review in a more transparent way
- integrate SEO and compliance thinking earlier in the content workflow
- standardize the path from raw product data to publish-ready listing assets

For ecommerce operations, cross-border marketplace work, catalog preparation, and AI-assisted listing creation, this kind of structured workspace is far closer to real daily work than a standalone chatbot flow.

### Tech Stack

- Next.js 14
- React
- TypeScript
- Supabase
- Vercel
- Gemini / OpenAI Image

### Local Development

```bash
npm install
npm run dev
npm run build
```

### Common Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
BUILTIN_GEMINI_API_KEY=
BUILTIN_KEY_ACCESS_PASSWORD=
```

# 艺术灵瞳 · 产品需求文档（PRD）

> 抖音AI创变者计划2026黑客松联赛 · 赛道四（视觉搜索）  
> 开发周期：2天（2026.07.24–07.26）  
> 版本：MVP v1.2（与当前代码实现对齐）

---

## 一、产品概述

### 1.1 产品定位

**「拍一件艺术品，AI给你讲门道」** —— AI 艺术导览、影响链探索与审美人格工具。

覆盖绘画、雕塑、装置、书法等；不是百科词条，而是像懂艺术的朋友指出「三个值得看的地方」，并支持继续探索与社交晒图。

### 1.2 核心价值主张

> **从「看懂一件作品」→「进入艺术对话与探索」→「形成可晒的审美身份」**

1. **理解**：三细节结构化讲解，而非只报作品名  
2. **探索**：艺术基因图谱（上游影响 / 下游影响）可下钻  
3. **身份**：拍满 3 件后解锁「艺术人格」，分享层级高于单次看展笔记  

### 1.3 目标用户

- 逛美术馆/博物馆、觉得「好看但看不懂」的观众  
- 在抖音刷到艺术品、想深入了解的用户  
- 艺术入门爱好者（要社交货币，也要一点真货）  

---

## 二、差异化（相对竞品）

| 维度 | 常见做法 | 艺术灵瞳 |
|------|----------|----------|
| 识别结果 | 标题+作者百科 | 「三个值得看的细节」口语讲解 |
| 结束后 | 用完即走 | 基因链下钻、风格想象、追问 |
| 社交 | 孤立工具 | 看展笔记图 + **艺术人格卡** |
| 场景 | 单一拍照 | 美术馆 / 抖音双场景 + 场馆标注 |

---

## 三、核心流程

```
场景选择（美术馆 / 抖音，可填场馆或博主）
        ↓
拍照 / 相册 / Demo 示例
        ↓
AI 解读（三细节 · 同流派 · 抖音博主展示 · 基因图谱 · 热门追问）
        ↓
可选：基因下钻（联网配图） / 风格想象 / 文字追问（多轮）
        ↓
生成「看展笔记」分享图
        ↘
履历满 3 件 → 解锁「艺术人格」→ 人格卡片文生图
```

**页面：** `page-home` → `page-loading` → `page-result` / `page-persona`

---

## 四、功能说明（以已交付为准）

| 状态 | 功能 | 说明 |
|------|------|------|
| ✅ | 拍照/相册上传 | 选图弹窗：拍照（capture）或从相册选择；前端压缩后 base64 |
| ✅ | 双场景 Venue | 美术馆 / 抖音弹窗；结果页展示；分享图底部 Canvas 叠加 |
| ✅ | AI 识别 + 三细节 | `/api/analyze`；含同流派、追问建议、抖音博主行、基因链 |
| ✅ | Demo 示例 | 无图请求 + `excludeKeys` 去重；360/Met 配图 |
| ✅ | 艺术基因图谱 | 上/下游各 1；点击 `/api/explore-gene`；浏览栈返回 |
| ✅ | 联网配图 | 360 为主、Met 兜底；服务端转 base64（基因探索 & Demo） |
| ✅ | 风格想象 | 「简述画面 + 文生图」；非像素级图生图；无图时禁用 |
| ✅ | 追问对话 | 前端维护多轮 `history` 传给 `/api/chat` |
| ✅ | 看展笔记分享 | `/api/generate-card`；失败则前端 Canvas 静态卡降级 |
| ✅ | 艺术人格 | 仅计拍照/Demo；满 3 件；半开放命名；文生图人格卡 |
| ❌ | 语音输入 | 未做（可口述演示） |
| ❌ | 识别历史浏览 UI | 仅有 localStorage 履历服务人格，无独立历史页 |
| ❌ | 抖音博主真检索/详情页 | 展示用；真图路径多为模型生成昵称；fallback 为预置 |
| ❌ | 真短视频 / 流式输出 | 分享为静图；接口同步返回全文 |

---

## 五、技术架构

```
浏览器 H5（零构建：index.html + app.js + style.css）
        │ fetch JSON / base64
        ▼
Node.js 原生 http（server.js，无 Express / 无 npm 依赖）
  ├── GET 静态 → public/
  ├── Qwen3.7-Plus（DashScope compatible-mode）
  │     视觉解读 / 对话 / 人格 / Imagine 画面简述 / 基因文字解读
  ├── wanx2.1-t2i-turbo（DashScope 异步文生图）
  │     看展笔记 / 人格卡 / 风格重绘
  ├── 360 搜图 → Met Museum API 兜底
  └── mock/fallback.json（Demo 三幅名画）
```

| 项 | 实现 |
|----|------|
| 启动 | `node server.js`（需 Node 18+ 全局 `fetch`） |
| 配置 | 复制 `config.example.json` → `config.json` 填入 Key |
| 默认端口 | 3000 |
| 持久化 | 无服务端 DB；履历/人格缓存在浏览器 `localStorage` |

### 5.1 主要文件

| 路径 | 职责 |
|------|------|
| `server.js` | 路由、Prompt、搜图、文生图轮询、静态服务 |
| `public/app.js` | 压缩、渲染、基因栈、人格、分享降级 |
| `public/index.html` | 四页 DOM 骨架 |
| `public/style.css` | 暗色美术馆风；桌面 `max-width: 520px` |
| `mock/fallback.json` | Demo/示例数据（含 `influenceChain`） |
| `config.example.json` | 配置模板（勿提交真实 Key） |

### 5.2 API 一览

| 方法路径 | 用途 | 关键入参 / 出参 |
|----------|------|----------------|
| `POST /api/analyze` | 识别解读；无图=Demo | `{ image?, excludeKeys? }` → `{ data, image? }` |
| `POST /api/explore-gene` | 基因节点再探索+配图 | `{ node, from }` → `{ data, image }` |
| `POST /api/chat` | 多轮追问 | `{ question, history?, context }` → `{ data.answer }` |
| `POST /api/imagine` | 风格重绘 | `{ image, style }` → `{ data.image }` |
| `POST /api/generate-card` | 看展笔记图（别名 `/api/share`） | 作品字段 → `{ data.image }` |
| `POST /api/personality` | 艺术人格（≥3 件履历） | `{ works }` → 人格 JSON |
| `POST /api/generate-persona-card` | 人格分享图 | 人格字段 → `{ data.image }` |

约定：成功多为 `{ success: true, data }`；未知 `/api/*` 返回 JSON 404。分享图字段名为 **`image`**（base64 data URL）。

### 5.3 解读结果 JSON（节选）

含：`title, artist, year, style, details[], relatedArtists[], suggestedQuestions[], douyinCreators[], influenceChain.{upstream,downstream}[]`，以及 `_source`（`qwen` / `fallback` / `qwen-explore`）。

### 5.4 客户端存储

| Key | 内容 |
|-----|------|
| `artlingtong_history_v1` | 拍照/Demo 履历（基因下钻**不计**） |
| `artlingtong_persona_v1` | 最近一次人格结果缓存 |

人格解锁阈值：**3** 件不重复作品。

---

## 六、关键体验规则

1. **真实拍照识别失败**：返回错误提示，**不再**静默换成另一幅名画（避免图文不符）。  
2. **Demo**：fallback 文案 + 联网配图；可进行风格想象。  
3. **Imagine**：视觉简述 + 文生图；UI 标明非像素级图生图。  
4. **Venue**：仅前端 Canvas 叠在分享图底部，不进文生图 prompt。  
5. **看展笔记生成失败**：前端 Canvas 静态卡片降级。  
6. **文生图**：异步任务轮询，最长约 90s，期间占用该 HTTP 请求。  
7. **抖音博主**：展示模块；非平台官方检索。  

---

## 七、视觉与演示

- **风格**：暗色 gallery、衬线标题（Noto Serif SC）、少卡片、编辑式排版  
- **演示建议**：场景入口 → 拍照或连点 Demo 满 3 件 → 基因点击 → 风格想象 → 看展笔记 → 解锁人格 → 人格卡  
- **手机**：同网访问电脑 `http://<IP>:3000`（可用 ngrok，注意勿裸奔公网刷额度）  

---

## 八、已知限制（诚实清单）

- 无用户登录、无服务端履历同步  
- 无 npm / 无自动化测试 / 无 README（以本 PRD + 代码为准）  
- 360 搜图为非官方 JSON，可能变更  
- 大陆网络下 Wikimedia 不可作为主图源（已弃用）  
- 安全加固（鉴权、路径沙箱、Key 轮换等）按需另排期，本版黑客松演示优先功能闭环  

---

## 九、版本记录

| 版本 | 说明 |
|------|------|
| v1.0 | 初始 PRD：三 API、看展笔记、暖色卡片设想 |
| v1.2 | 对齐实现：基因图谱、配图、Imagine、人格、Venue、多轮 chat、分享降级；修正模型与接口描述 |

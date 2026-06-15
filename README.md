# AI 考试学习平台

> 基于 DeepSeek 的本地化 AI 学习平台：上传资料 → AI 提取/生成题目 → 智能组卷答题 → 自动判分 → 考后分析 → 错题本与间隔重复复习。

一个 monorepo 全栈应用，前端 React + 后端 Express，数据全部存储在本地 SQLite，API 密钥加密存于本地，不上传任何第三方服务器。

## ✨ 功能特性

- **资料管理**：上传 PDF / Word，支持 10 种资料类型（真题、教材、笔记、错题集等），大文件自动切片
- **题目提取与生成**：带答案的试卷自动「提取」题目并分离答案；教材/笔记类资料由 AI「生成」题目
- **OCR 识别**：扫描版 PDF 通过硅基流动（SiliconFlow）DeepSeek-OCR 识别文字
- **智能组卷**：AI 根据掌握程度优先安排薄弱知识点，或使用全部题目
- **在线答题**：单选/多选/判断/填空/简答，快捷键操作，草稿自动保存
- **自动判分 + AI 考后分析**：薄弱知识点、错题分析、提升建议
- **错题本**：答错自动收集，5 维掌握度 + SM-2 间隔重复算法安排复习
- **今日学习**：AI 复习引擎根据学习状态安排每日计划
- **学习分析**：得分趋势、知识点掌握雷达图

## 🛠 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 · TypeScript · Vite · React Router · Recharts · Axios |
| 后端 | Node.js · Express · Drizzle ORM · better-sqlite3 |
| AI | DeepSeek Chat API（出题/判分/分析）· SiliconFlow DeepSeek-OCR（图片识别） |
| 测试 | Vitest · Testing Library |

## 📁 项目结构

```
AIstudy/
├── packages/
│   ├── backend/          # Express API + SQLite (端口 3001)
│   │   └── src/
│   │       ├── routes/       # API 路由
│   │       ├── services/     # AI/OCR/评分/分析/间隔重复 等业务逻辑
│   │       ├── processors/   # 资料处理（策略模式）
│   │       └── db/           # Drizzle schema 与初始化
│   └── frontend/         # React SPA (开发端口 5173)
│       └── src/
│           ├── pages/        # 各功能页面
│           ├── components/ui # 统一组件库 (Card/Button/Badge/...)
│           └── contexts/     # 全局状态
├── docs/                 # 平台说明文档
└── scripts/              # 部署脚本
```

## 🚀 本地开发

环境要求：**Node.js >= 20**（见 `.nvmrc`）

```bash
# 1. 安装依赖（workspace 会自动安装前后端）
npm install

# 2. 启动后端（端口 3001）
npm run dev:backend

# 3. 另开一个终端，启动前端（端口 5173，已配置 /api 代理到 3001）
npm run dev:frontend
```

浏览器打开 http://localhost:5173

## 🔑 配置 API 密钥

平台运行后，进入「系统设置」页面填写密钥（密钥加密存储在本地 SQLite，不写入代码）：

- **DeepSeek API Key**：用于出题、判分、分析。前往 [DeepSeek 开放平台](https://platform.deepseek.com) 获取
- **SiliconFlow API Key**（可选）：用于扫描版 PDF 的 OCR。前往 [硅基流动平台](https://cloud.siliconflow.cn) 获取，模型 `deepseek-ai/DeepSeek-OCR`

## 📦 生产构建

```bash
npm run build
```

构建后后端会自动托管前端静态资源（`packages/frontend/dist`），整个应用通过**单一端口 3001** 提供服务：

```bash
# 启动生产服务（默认 3001，可用 PORT 环境变量覆盖）
PORT=3001 npm run start -w packages/backend
```

打开 http://服务器IP:3001 即可访问完整应用。

## 🖥 服务器一键部署

在一台全新的 Linux 服务器（Ubuntu/Debian）上：

```bash
git clone https://github.com/luckycn9527/AIstudy.git
cd AIstudy
bash scripts/deploy.sh
```

脚本会自动完成：检查/安装 Node 20 → 安装依赖 → 构建前后端 → 用 PM2 守护进程启动。

详见 [scripts/deploy.sh](scripts/deploy.sh) 与下方「部署说明」。

### 部署说明

- 默认监听端口 `3001`，可在运行脚本前设置 `export PORT=8080` 覆盖
- 进程由 [PM2](https://pm2.keymetrics.io/) 守护，开机自启
- 常用运维命令：

```bash
pm2 status            # 查看状态
pm2 logs aistudy      # 查看日志
pm2 restart aistudy   # 重启
pm2 stop aistudy      # 停止
```

- 如需通过 80 端口对外访问，建议在前面加 Nginx 反向代理到 `127.0.0.1:3001`

## ✅ 测试

```bash
npm test                          # 前后端全部测试
npm run test -w packages/backend  # 仅后端
npm run test -w packages/frontend # 仅前端
```

## 📝 数据与隐私

- 所有数据（题库、考试记录、错题、知识点）存储在 `packages/backend/data/db.sqlite`
- 上传的原始文件存储在 `packages/backend/data/uploads/`
- API 密钥加密存储在本地数据库，**不会**上传到任何外部服务器
- 上述数据目录已在 `.gitignore` 中排除，不会进入版本库

## 📄 License

[Apache-2.0](LICENSE)

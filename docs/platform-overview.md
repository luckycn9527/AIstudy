# AI 考学平台 — 功能与逻辑全景

## 一、整体架构

```
前端 (React + Vite)          后端 (Express + SQLite)         外部服务
┌─────────────────┐         ┌─────────────────────┐        ┌──────────┐
│  SPA 单页应用    │ ──API──▶│  REST API 服务       │──────▶│ DeepSeek │
│  localhost:5173  │         │  localhost:3001      │        │   API    │
└─────────────────┘         └─────────────────────┘        └──────────┘
                                     │
                              ┌──────┴──────┐
                              │  SQLite DB  │
                              │  + 文件存储  │
                              └─────────────┘
```

**技术栈：**
- 前端：React 18 + TypeScript + React Router + Recharts + Axios + Vite
- 后端：Express + Drizzle ORM + better-sqlite3 + multer + OpenAI SDK
- AI：DeepSeek Chat API（兼容 OpenAI 接口）
- 文档解析：pdf-parse (PDF) + mammoth (DOCX)

---

## 二、数据模型（12 张表）

| 表 | 作用 | 关键字段 |
|---|---|---|
| `subjects` | 学科 | id, name, createdAt |
| `materials` | 学习资料 | id, subjectId, fileName, **materialType**, status, extractedText, **weight**, **examYear**, **source** |
| `semantic_chunks` | **语义切片** | id, materialId, title, summary, content, tokens, **difficulty**, **importance**, prerequisites, sortOrder |
| `knowledge_points` | 知识点 | id, materialId, subjectId, title, **weight**, **difficulty**, **frequency**, **chapter** |
| `questions` | 题库 | id, subjectId, materialId, type, stem, correctAnswer, **difficulty**, **score**, **chapter**, **examYear**, **source** |
| `exam_sessions` | 考试会话 | id, subjectId, totalScore, maxScore, startedAt, submittedAt, status |
| `exam_answers` | 答题记录 | id, sessionId, questionId, userAnswer, score, status, **timeSpent** |
| `wrong_question_book` | **错题本（间隔重复）** | id, subjectId, questionId, wrongCount, **masteryLevel**, **nextReviewAt**, consecutiveCorrect, status |
| `knowledge_mastery` | **知识掌握度追踪** | id, subjectId, knowledgePointId, masteryLevel, totalAttempts, correctCount, **forgettingRate**, **nextReviewAt** |
| `ai_cache` | **AI 响应缓存** | id, contentHash, promptType, response, model, tokens |
| `analysis_reports` | 分析报告 | id, sessionId, subjectId, weakPoints, errorAnalysis, suggestions |
| `config` | 系统配置 | key, value |

**关系图：**
```
subject ──1:N──▶ materials ──1:N──▶ semantic_chunks
                     │
                     ├──1:N──▶ knowledge_points ◀──1:1── knowledge_mastery
                     │
                     └──1:N──▶ questions ◀──1:1── wrong_question_book
                                   │
subject ──1:N──▶ exam_sessions ──1:N──▶ exam_answers ──N:1──▶ questions
                     │
                     └──1:N──▶ analysis_reports
```

---

## 三、资料类型系统 (Material Type)

### 类型定义与权重

| type | 含义 | 权重 | 最佳处理策略 |
|---|---|---|---|
| `exam_paper` | 真题/试卷 | 10 | **提取题目+答案**，分析高频考点、年份分布 |
| `wrong_questions` | 错题集 | 9 | **直接进入错题本**，AI 分析错误模式共性 |
| `textbook` | 教材 | 8 | **提取知识树** → 知识图谱 → 再生成题（非直接出题） |
| `formula_sheet` | 公式表 | 7 | 提取公式 → 生成计算题/填空题 |
| `cheat_sheet` | 速记表 | 7 | 提取关键概念 → 生成记忆类题目 |
| `notes` | 笔记 | 6 | AI 补全缺失知识 + 根据笔记出题 |
| `summary` | 总结 | 6 | 提取要点 → 生成综合题 |
| `slides` | PPT | 5 | 提取结构化内容 → 生成概念题 |
| `answer_sheet` | 答案 | 5 | 与试卷配对使用 |
| `reference` | 参考资料 | 4 | 通用处理 |

### 处理策略差异（设计目标）

```
教材 (textbook):
  知识源，非题目源
  教材 → 章节结构 → 知识树 → 核心概念/定义/公式 → 高频考点 → 再生成题
  避免：直接从教材疯狂生成低质量题

真题 (exam_paper):
  最重要的资料，代表真实考试分布
  真题 → 提取题目+答案+元数据(年份/分值/章节) → 高频考点分析
  例如：微积分 - 导数近5年出现率92%，泰勒展开17%

笔记 (notes):
  用户自己的理解，非标准知识
  笔记 → AI 补全缺失知识 → 根据笔记内容出题
  例如：你的笔记缺少导数几何意义、洛必达法则条件

错题集 (wrong_questions):
  直接进入学习引擎
  错题 → 分析共同错误模式 → 针对性强化
  例如：你不是不会概率论，而是条件概率转换能力弱
```

---

## 四、核心流程

### 流程 1：资料上传 → 文本提取 → 智能切片

```
用户选择资料类型 + 上传 PDF/DOCX (≤200MB)
    │
    ▼
multer 存储到 data/uploads/ (UUID 命名)
    │
    ▼
修复中文文件名编码 (latin1 → utf8)
    │
    ▼
根据 materialType 设置权重 (exam_paper=10, textbook=8, notes=6...)
    │
    ▼
创建 material 记录 (status: processing, materialType, weight)
    │
    ▼ (异步处理，不阻塞响应)
DocumentProcessor.extractAndChunk()
    │
    ├─ PDF: pdf-parse → Unicode NFC 规范化 → 清理控制字符
    └─ DOCX: mammoth → Unicode NFC 规范化
    │
    ▼
文本长度判断 (阈值: 40,000 字符)
    ├─ ≤40K: 单条 material，status → ready
    └─ >40K: 智能切片
         ├─ 优先按章节标题切分 (第X章/节、一二三、Chapter X)
         ├─ 超大章节按段落边界二次切分 (保证知识块完整性)
         ├─ 切片间 500 字符重叠 (上下文连续性)
         └─ 每个切片 → 独立 material 记录 (继承 materialType + weight)
              命名: "原文件名 - 第X章标题"
```

### 流程 2：题目提取/生成 → 存入题库（避免重复）

```
┌─────────────────────────────────────────────────────────────┐
│ 方式 A: 提取题目 (mode: extract) — 带答案试卷               │
├─────────────────────────────────────────────────────────────┤
│ • AI 识别题型 → 分离题干/选项/答案/解析                      │
│ • 每份资料只提取一次，UI 显示"已提取 X 题"                   │
│ • 已提取的资料不再显示提取按钮                               │
│ • 支持单份提取 或 批量提取所有未处理资料                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 方式 B: AI 生成 (mode: generate) — 学习资料/教材            │
├─────────────────────────────────────────────────────────────┤
│ • AI 分析内容 → 自动决定题型分布和数量                       │
│ • 适合教材、笔记等非题目类资料                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 方式 C: 指定数量 (传 counts) — 兼容旧版                     │
└─────────────────────────────────────────────────────────────┘
```

**题型与判分：**
| 题型 | type 值 | 答案格式 | 判分方式 |
|---|---|---|---|
| 单选题 | single_choice | "A" | 本地精确匹配 |
| 多选题 | multiple_choice | "A,B,C" | 本地集合匹配 |
| 判断题 | true_false | "正确"/"错误" | 本地精确匹配 |
| 填空题 | fill_blank | 答案文本 | 本地去空格匹配 |
| 简答题 | short_answer | 参考答案 | AI 评分 (0-1分 + 理由) |

### 流程 3：智能组卷 → 答题 → 判分

```
组卷方式:
    ├─ 🎯 智能组卷 (AI 规划)
    │     从多份资料的题库中均衡选题:
    │     • 题型均衡 (覆盖多种题型)
    │     • 资料覆盖 (均匀覆盖各份资料)
    │     • 知识点覆盖 (避免重复考察)
    │     • 数量控制 (默认 ≤20 题)
    │     • 权重优先 (高权重资料的题目优先)
    │
    └─ ✏️ 全部答题
          使用题库中所有题目
    │
    ▼
创建 exam_session + 批量创建 exam_answers
    │
    ▼
前端答题界面 (通过 Router state 传递会话数据)
    • 逐题展示 + 导航栏跳转
    • 实时已答/未答状态
    │
    ▼
提交 → 判分引擎
    ├─ 客观题: 本地即时判分
    └─ 主观题: AI 评分 (DeepSeek)
    │
    ▼
结果页: 总分 + 每题详情 + 解析
```

### 流程 4：考后分析

```
结果页 → "生成分析报告"
    │
    ▼
AI 分析全部答题数据
    │
    ▼
输出:
    ├─ weakPoints: 薄弱知识点
    ├─ errorAnalysis: 每道错题原因
    └─ suggestions: 针对性提升建议
```

---

## 五、错题本与掌握度系统（Schema 已就绪）

### 错题本 (wrong_question_book)

```
答错题目 → 自动加入错题本
    │
    ▼
追踪字段:
    • wrongCount: 错误次数
    • masteryLevel: 掌握度 (0-100)
    • nextReviewAt: 下次复习时间 (间隔重复算法)
    • consecutiveCorrect: 连续正确次数
    • status: new → reviewing → mastered
```

**掌握度等级：**
| 分数 | 状态 |
|---|---|
| 0-30 | 未掌握 |
| 30-60 | 模糊 |
| 60-80 | 理解 |
| 80-95 | 熟练 |
| 95-100 | 精通 |

### 知识掌握度 (knowledge_mastery) — 多维度

```
每个知识点动态追踪 5 个维度:
    • memoryScore: 记忆 (能否回忆)
    • understandingScore: 理解 (能否解释)
    • applicationScore: 应用 (能否使用)
    • speedScore: 速度 (答题快慢)
    • stabilityScore: 稳定性 (是否稳定正确)
    
    → masteryLevel = 加权平均

学习状态机:
    unknown → seen → understanding → practicing
        → mastered → stable → forgetting → review_required
```

### 认知层级 (Bloom's Taxonomy)

```
题目和切片都标注认知层级:
    remember   (记忆) — 能回忆事实
    understand (理解) — 能解释概念
    apply      (应用) — 能解决问题
    analyze    (分析) — 能拆解结构
    evaluate   (评价) — 能判断优劣
    create     (创造) — 能综合创新

用途:
    用户"公式"掌握差 → 多出 apply 层级计算题
    用户"概念"掌握差 → 多出 understand 层级理解题
```

### 知识关系图谱 (knowledge_relations)

```
知识点之间的关系:
    prerequisite  — 前置依赖 (学A必须先学B)
    belongs_to    — 属于 (子概念属于父概念)
    related_to    — 相关 (有关联但非依赖)
    derived_from  — 推导自 (B由A推导)
    similar_to    — 相似 (容易混淆)
    conflicts_with — 易混淆 (需要区分)
```

### 语义切片类型 (chunkType)

```
每个切片标注内容类型:
    concept       — 概念
    definition    — 定义
    formula       — 公式
    theorem       — 定理
    example       — 示例
    exercise      — 练习
    explanation   — 解释
    conclusion    — 总结
    prerequisite  — 前置知识
    methodology   — 方法论

用途: AI 定向生成训练
    公式切片 → 生成计算题
    概念切片 → 生成理解题
    定理切片 → 生成证明/应用题
```

### Review Engine (复习引擎)

```
GET /api/subjects/:subjectId/review/today

返回:
{
  urgentReviews: [],        // 即将遗忘的错题
  weakKnowledge: [],        // 薄弱知识点
  recommendedQuestions: [],  // AI 推荐题目
  summary: {
    urgentCount,
    weakKnowledgeCount,
    recommendedCount,
    estimatedMinutes        // 预计学习时间
  }
}

用户每天打开 → "开始今日学习" → 系统自动安排
```

### AI 缓存 (ai_cache)

```
AI 调用前:
    1. 计算 content_hash (输入内容 hash)
    2. 查询 ai_cache (content_hash + prompt_type)
    3. 命中 → 直接返回缓存
    4. 未命中 → 调用 AI → 存入缓存
```

### Strategy Pattern (资料处理策略)

```
MaterialProcessorFactory
    ├── ExamPaperProcessor   (priority: 10)
    │     → 提取题目+答案, 分析高频考点
    ├── WrongQuestionProcessor (priority: 9)
    │     → 进入错题本, 分析错误模式
    ├── TextbookProcessor    (priority: 8)
    │     → 知识树 → 知识图谱 → 再生成题
    ├── FormulaSheetProcessor (priority: 7)
    │     → 提取公式 → 生成计算题
    ├── NotesProcessor       (priority: 6)
    │     → AI 补全 + 根据笔记出题
    └── ReferenceProcessor   (priority: 4)
          → 通用处理

每种策略定义:
    • extractionHint: AI 提取指令增强
    • knowledgeHint: 知识点提取指令
    • preferredCognitiveLevels: 偏好认知层级
    • recommendedActions: 推荐处理动作
```

---

## 六、前端页面结构

| 路由 | 页面 | 核心功能 |
|---|---|---|
| `/home` | HomePage | 仪表盘：学习时长、正确率、趋势图、雷达图、最近考试、AI 分析摘要 |
| `/subjects` | SubjectsPage | 卡片式学科管理：创建/删除，显示题目数+正确率，点击进入详情 |
| `/subjects/:id` | SubjectDetailPage | **学科专属页**：统计 + 资料上传(选类型) + 提取/生成 + 智能组卷 |
| `/materials` | MaterialsPage | 资料管理：上传/删除、AI 分析知识点 |
| `/questions` | QuestionsPage | 题库管理：按题型筛选、手动生成 |
| `/exam` | ExamPage | 答题：选题 / 直接答题（支持从学科详情跳转） |
| `/exam/:id/result` | ResultPage | 判分结果 + AI 分析报告 |
| `/analytics` | AnalyticsPage | 得分趋势 + 知识点掌握雷达图 |
| `/settings` | SettingsPage | API Key 配置 + 连接测试 |

---

## 七、侧边栏

```
┌─────────────────────┐
│  🟣 AI 考学平台      │
│  Powered by DeepSeek │
├─────────────────────┤
│  📐 当前: XXX        │  当前学科徽章
├─────────────────────┤
│  🏠 首页             │
│  📐 我的学科         │
│  📚 资料管理         │
│  📋 题库中心         │
│  ✏️ 考试中心         │
│  📈 学习进度         │
│  ⚙️ 设置             │
├─────────────────────┤
│  今日: XX 分钟 📈    │  + 7天迷你折线图
├─────────────────────┤
│  👤 学习者           │
└─────────────────────┘
```

---

## 八、AI 服务能力

| 方法 | 用途 | 触发场景 |
|---|---|---|
| `testConnection()` | 验证 API Key | 设置页 |
| `analyzeKnowledgePoints(text)` | 提取知识点 | 资料管理"AI 分析" |
| `extractQuestionsFromPaper(text)` | 从试卷提取题目+答案 | 学科详情"提取题目" |
| `autoGenerateQuestions(text)` | AI 自动出题 | 学科详情"AI 生成" |
| `generateQuestions({text, counts})` | 按数量出题 | 题库管理(旧版) |
| `scoreSubjectiveAnswer(...)` | 主观题评分 | 提交答卷 |
| `generateAnalysisReport(examData)` | 考后分析 | 结果页 |
| `planExam({questions, materials})` | 智能组卷选题 | 学科详情"智能组卷" |

---

## 九、API 端点清单

### 学科
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/subjects` | 获取所有学科 |
| POST | `/api/subjects` | 创建学科 |
| DELETE | `/api/subjects/:id` | 级联删除学科 |

### 资料
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/subjects/:subjectId/materials` | 获取资料列表 |
| POST | `/api/subjects/:subjectId/materials/upload` | 上传资料 (支持 materialType 参数) |
| DELETE | `/api/materials/:id` | 删除资料 |
| POST | `/api/materials/:id/analyze` | AI 分析知识点 |
| GET | `/api/materials/:id/knowledge-points` | 获取知识点 |

### 题目
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/subjects/:subjectId/questions` | 获取题目列表 |
| POST | `/api/subjects/:subjectId/questions/generate` | 提取/生成题目 (mode: extract\|generate) |

### 考试
| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/subjects/:subjectId/exams` | 创建考试 (指定题目) |
| POST | `/api/subjects/:subjectId/exams/plan` | 智能组卷 (AI 选题) |
| GET | `/api/exams/:id` | 获取考试详情 |
| POST | `/api/exams/:id/submit` | 提交答卷+判分 |
| GET | `/api/exams/:id/result` | 获取判分结果 |
| POST | `/api/exams/:id/analyze` | 生成分析报告 |
| GET | `/api/exams/:id/report` | 获取分析报告 |

### 统计 & 配置
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/dashboard` | 仪表盘聚合数据 |
| GET | `/api/subjects/:subjectId/analytics` | 学科统计 |
| GET | `/api/subjects/:subjectId/analytics/trend` | 得分趋势 |
| GET | `/api/config/api-key-status` | API Key 状态 |
| POST | `/api/config/api-key` | 保存 API Key |
| POST | `/api/config/api-key/test` | 测试连接 |

---

## 十、性能优化（已实施）

| 优化项 | 说明 |
|---|---|
| 数据库索引 (23个) | 覆盖所有外键、查询热点、错题本复习时间、AI 缓存 hash |
| 批量 INSERT | 答题记录一次性插入 |
| inArray 精确查询 | 替代全表扫描 + JS 过滤 |
| 异步文本提取 | 上传后立即返回，后台处理 |
| 智能切片 | >40K 字符按章节/段落切分，避免 AI 上下文溢出 |
| options JSON 解析 | 考试接口统一解析，前端无需处理 |
| 共享测试 Schema | 所有测试文件使用统一 test-schema.ts |

---

## 十一、已实现 vs 待实现

### ✅ 已实现（代码完成）

**核心功能：**
- 资料类型系统 (10 种 materialType + 自动权重)
- 大文件自动切片 (章节感知 + 段落边界)
- 题目提取 (从试卷) / AI 生成 (从教材)
- 智能组卷 (AI 均衡选题)
- 答题 + 判分 (客观题本地 + 主观题 AI)
- 考后 AI 分析报告

**认知工程 Schema (12 张表)：**
- semantic_chunks (chunkType + cognitiveLevel + embedding 预留)
- knowledge_relations (6 种关系类型 + 强度)
- knowledge_mastery (5 维掌握度 + 学习状态机)
- wrong_question_book (间隔重复)
- ai_cache (content_hash 去重)
- questions (cognitiveLevel + discrimination + mistakeRate + qualityScore)

**架构模式：**
- Strategy Pattern (MaterialProcessorFactory, 10 种策略)
- Review Engine API (GET /api/subjects/:id/review/today)
- 共享测试 Schema (test-schema.ts 单一数据源)

### 🔲 待实现（Schema + 架构已就绪，逻辑待开发）

| 优先级 | 功能 | 说明 |
|---|---|---|
| **P0** | 错题自动收集 | 答错后写入 wrong_question_book + 计算 nextReviewAt |
| **P0** | 知识掌握度更新 | 每次答题后更新 5 维分数 + 学习状态转换 |
| **P0** | 间隔重复算法 | SM-2 或类似算法计算复习间隔 |
| **P0** | Review Engine 前端 | "今日学习"页面，展示 AI 推荐 |
| **P1** | 按类型差异化处理 | 调用 Strategy 的 extractionHint 增强 AI prompt |
| **P1** | AI 缓存命中 | 相同输入直接返回缓存 |
| **P1** | 知识图谱构建 | AI 分析知识点关系，写入 knowledge_relations |
| **P1** | Embedding 生成 | 语义切片向量化 (为 RAG 做准备) |
| **P2** | 动态难度调节 | 连续正确→提高难度，连续错误→回退基础 |
| **P2** | 高频考点分析 | 统计各知识点历年出现率 |
| **P2** | 相似题推荐 | 基于 embedding 相似度推荐 |
| **P2** | Agent Layer | LearningPlannerAgent, WeaknessAnalysisAgent 等 |

---

## 十二、典型用户操作路径

```
新用户首次使用:
  设置 API Key → 创建学科 → 上传真题(选类型:exam_paper)
  → 提取题目 → 智能组卷 → 答题 → 查看结果 → AI 分析

日常复习:
  选择学科 → 智能组卷 (AI 从多份资料均衡选题)
  → 答题 → 查看薄弱点 → 针对性复习

添加新资料:
  进入学科详情 → 选择资料类型 → 上传
  → 自动提取/切片 → 提取题目(一次性) → 题库扩充

未来 - 间隔重复:
  打开系统 → AI 推荐今日复习:
    • 12 道即将遗忘的题
    • 3 个连续错误知识点
    • 2 个高风险知识模块
```

---

## 十三、架构演进方向

### 当前定位

```
已经不是：上传 PDF → 生成题 → 考试
而是：认知工程平台

正在建模：
    • 记忆与遗忘 (间隔重复)
    • 理解深度 (Bloom 认知层级)
    • 知识关系 (图谱)
    • 错误模式 (错题分析)
    • 学习行为 (答题速度/稳定性)
    • 强化路径 (AI 推荐)
```

### 数据分层架构

```
KnowledgeSource (知识源)
    ├── Raw File (原始文件)
    ├── Parsed Structure (解析结构)
    ├── Semantic Blocks (语义块 + chunkType + cognitiveLevel)
    ├── Knowledge Points (知识点 + weight + difficulty)
    ├── Knowledge Relations (关系图谱)
    ├── Question Links (题目关联 + discrimination + mistakeRate)
    ├── Mastery State (5维掌握度 + 学习状态机)
    └── Memory Weight (遗忘率 + 复习时间)
```

### Agent Layer (下一阶段)

```
当前: AIService (工具函数层)
    generateQuestions(), score(), analyze()

目标: Agent Layer (智能体层)
    ├── LearningPlannerAgent    — 规划学习路径
    ├── WeaknessAnalysisAgent   — 诊断薄弱点
    ├── ReviewSchedulerAgent    — 安排复习计划
    ├── QuestionGenerationAgent — 定向出题
    ├── KnowledgeGraphAgent     — 构建知识图谱
    └── AdaptiveDifficultyAgent — 动态难度调节
```

### 基础设施演进

```
当前:
    Express + SQLite + 同步处理

下一步:
    ├── Job Queue (BullMQ/Redis) — 长文档异步处理
    ├── AI Cache Layer — content_hash 去重
    ├── Spaced Repetition Engine — SM-2 算法
    ├── Embedding Store — 向量检索 (RAG)
    └── Event Bus — 答题事件 → 触发掌握度更新
```

### 目标产品形态

```
AI SuperMemo + Notion + Anki + AI Tutor

核心体验:
    用户打开 → "开始今日学习"
    AI 自动安排:
        • 12 道即将遗忘的题 (间隔重复)
        • 3 个连续错误知识点 (针对强化)
        • 2 个高风险知识模块 (预防遗忘)
        • 预计 35 分钟

    不是用户找题，而是 AI 找用户。
```

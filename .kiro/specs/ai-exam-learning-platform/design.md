# Design Document

## Overview

AI 考试学习平台是一个本地部署的单用户 Web 应用，采用前后端分离架构。后端基于 Node.js + Express 提供 RESTful API，前端使用 React + Vite 构建交互界面。系统通过 SQLite 实现本地数据持久化，通过 DeepSeek API（OpenAI 兼容接口）提供 AI 智能服务（知识点提取、考题生成、主观题评分、考后分析）。文件解析使用 pdf-parse 和 mammoth 进行本地文本抽取。

## Architecture

本系统采用前后端分离的本地 Web 应用架构，单用户模式运行于本机。

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                     │
│  React + Vite + Recharts                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ 资料管理  │ │ 题库管理  │ │ 答题系统  │ │ 进度可视化 │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST API
┌────────────────────────┴────────────────────────────────┐
│                   Backend (Node.js + Express)             │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐  │
│  │ Route Layer  │ │ Service Layer │ │ Data Access    │  │
│  └──────────────┘ └───────────────┘ └────────────────┘  │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐  │
│  │Doc Processor │ │  AI Service   │ │Scoring Engine  │  │
│  └──────────────┘ └───────────────┘ └────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐   ┌──────┴──────┐  ┌─────┴─────┐
    │ SQLite  │   │ File System │  │DeepSeek API│
    │   DB    │   │  (uploads)  │  │ (external) │
    └─────────┘   └─────────────┘  └───────────┘
```

### 技术栈

| 层级 | 技术选型 | 用途 |
|------|---------|------|
| 前端框架 | React 18 + TypeScript | UI 组件与交互 |
| 构建工具 | Vite | 开发与打包 |
| 图表库 | Recharts | 学习进度可视化 |
| HTTP 客户端 | Axios | 前端 API 调用 |
| 后端框架 | Express + TypeScript | HTTP 服务与路由 |
| 数据库 | better-sqlite3 | SQLite 访问 |
| ORM | Drizzle ORM | 类型安全的数据库操作 |
| PDF 解析 | pdf-parse | PDF 文本抽取 |
| Word 解析 | mammoth | Word 文本抽取 |
| AI 接口 | OpenAI SDK (兼容模式) | DeepSeek API 调用 |

### 目录结构

```
AIstudy/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/          # API 路由定义
│   │   │   ├── services/        # 业务逻辑层
│   │   │   ├── db/              # 数据库 schema 与迁移
│   │   │   ├── processors/      # 文件解析模块
│   │   │   └── index.ts         # 入口文件
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── components/      # 通用 UI 组件
│       │   ├── pages/           # 页面组件
│       │   ├── hooks/           # 自定义 Hooks
│       │   ├── services/        # API 调用封装
│       │   └── App.tsx
│       └── package.json
├── data/                        # 运行时数据目录
│   ├── db.sqlite                # SQLite 数据库文件
│   └── uploads/                 # 上传文件存储
└── package.json                 # Monorepo 根配置
```

## Data Models

### 数据库 Schema

```typescript
// packages/backend/src/db/schema.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 学科表
export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),           // UUID
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(), // ISO 8601
});

// 资料表
export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),   // 'pdf' | 'docx'
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  status: text('status').notNull(),        // 'uploading' | 'processing' | 'ready' | 'failed'
  extractedText: text('extracted_text'),
  errorMessage: text('error_message'),
  uploadedAt: text('uploaded_at').notNull(),
});

// 知识点表
export const knowledgePoints = sqliteTable('knowledge_points', {
  id: text('id').primaryKey(),
  materialId: text('material_id').notNull().references(() => materials.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  title: text('title').notNull(),
  description: text('description'),
});

// 题目表
export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  materialId: text('material_id').references(() => materials.id),
  type: text('type').notNull(),            // 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer'
  stem: text('stem').notNull(),
  options: text('options'),                // JSON: string[] (选择题选项)
  correctAnswer: text('correct_answer').notNull(), // 单选/判断: "A"; 多选: "A,B,C"; 填空: 答案文本; 简答: 参考答案
  explanation: text('explanation').notNull(),
  knowledgePointId: text('knowledge_point_id').references(() => knowledgePoints.id),
  createdAt: text('created_at').notNull(),
});

// 考试会话表
export const examSessions = sqliteTable('exam_sessions', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  totalScore: real('total_score'),
  maxScore: real('max_score'),
  startedAt: text('started_at').notNull(),
  submittedAt: text('submitted_at'),
  status: text('status').notNull(),        // 'in_progress' | 'submitted' | 'scored' | 'analyzed'
});

// 答题记录表
export const examAnswers = sqliteTable('exam_answers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => examSessions.id),
  questionId: text('question_id').notNull().references(() => questions.id),
  userAnswer: text('user_answer'),
  score: real('score'),
  maxScore: real('max_score').notNull().default(1),
  scoringReason: text('scoring_reason'),
  status: text('status').notNull(),        // 'answered' | 'scored' | 'pending_score'
});

// 分析报告表
export const analysisReports = sqliteTable('analysis_reports', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => examSessions.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  weakPoints: text('weak_points').notNull(),       // JSON: string[]
  errorAnalysis: text('error_analysis').notNull(), // JSON: { questionId, reason }[]
  suggestions: text('suggestions').notNull(),      // JSON: string[]
  createdAt: text('created_at').notNull(),
});

// 系统配置表
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
```

### 核心类型定义

```typescript
// packages/backend/src/types.ts

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';
export type MaterialStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type ExamStatus = 'in_progress' | 'submitted' | 'scored' | 'analyzed';
export type AnswerStatus = 'answered' | 'scored' | 'pending_score';

export interface GenerateQuestionsParams {
  materialIds: string[];
  counts: Record<QuestionType, number>; // 各题型数量
}

export interface ScoringResult {
  questionId: string;
  score: number;
  maxScore: number;
  reason?: string;
}

export interface AnalyticsData {
  subjectId: string;
  totalExams: number;
  averageScoreRate: number;
  knowledgeMastery: Array<{
    knowledgePointId: string;
    title: string;
    masteryRate: number;
  }>;
  scoreTrend: Array<{
    date: string;
    scoreRate: number;
  }>;
}
```

## API Design

### RESTful API 端点

#### 学科管理

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subjects` | 获取所有学科列表 |
| POST | `/api/subjects` | 创建新学科 |
| DELETE | `/api/subjects/:id` | 删除学科及所有关联数据 |

#### 资料管理

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subjects/:subjectId/materials` | 获取学科下的资料列表 |
| POST | `/api/subjects/:subjectId/materials/upload` | 上传资料文件 |
| POST | `/api/materials/:id/analyze` | 触发 AI 分析 |
| GET | `/api/materials/:id/knowledge-points` | 获取资料的知识点 |

#### 题库管理

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subjects/:subjectId/questions` | 获取学科下的题目列表 |
| POST | `/api/subjects/:subjectId/questions/generate` | AI 生成考题 |

#### 答题与判分

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/subjects/:subjectId/exams` | 创建考试会话 |
| GET | `/api/exams/:id` | 获取考试详情（含题目） |
| POST | `/api/exams/:id/submit` | 提交答卷并触发判分 |
| GET | `/api/exams/:id/result` | 获取判分结果 |
| POST | `/api/exams/:id/analyze` | 触发考后 AI 分析 |
| GET | `/api/exams/:id/report` | 获取分析报告 |

#### 学习进度

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subjects/:subjectId/analytics` | 获取学科进度统计 |
| GET | `/api/subjects/:subjectId/analytics/trend` | 获取得分趋势（支持 ?range=7d\|30d\|all） |

#### 系统配置

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config/api-key-status` | 获取 API 密钥配置状态 |
| POST | `/api/config/api-key` | 保存 API 密钥 |
| POST | `/api/config/api-key/test` | 测试 API 连接 |

### API 响应格式

```typescript
// 成功响应
interface ApiResponse<T> {
  success: true;
  data: T;
}

// 错误响应
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### 文件上传验证

```typescript
// packages/backend/src/services/upload.service.ts

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateUploadFile(file: { mimetype: string; size: number }): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: '仅支持 PDF 和 Word 格式' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小超过上限（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` };
  }
  return { valid: true };
}
```

## Components and Interfaces

### 后端服务层

#### DocumentProcessor

```typescript
// packages/backend/src/processors/document.processor.ts

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export class DocumentProcessor {
  async extractText(filePath: string, fileType: 'pdf' | 'docx'): Promise<string> {
    if (fileType === 'pdf') {
      return this.extractFromPdf(filePath);
    }
    return this.extractFromDocx(filePath);
  }

  private async extractFromPdf(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return result.text;
  }

  private async extractFromDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
}
```

#### AIService

```typescript
// packages/backend/src/services/ai.service.ts

import OpenAI from 'openai';

export class AIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async analyzeKnowledgePoints(text: string): Promise<KnowledgePoint[]> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: KNOWLEDGE_EXTRACTION_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content!);
  }

  async generateQuestions(params: {
    text: string;
    knowledgePoints: KnowledgePoint[];
    counts: Record<QuestionType, number>;
  }): Promise<GeneratedQuestion[]> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: QUESTION_GENERATION_PROMPT },
        { role: 'user', content: JSON.stringify(params) },
      ],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content!);
  }

  async scoreSubjectiveAnswer(params: {
    stem: string;
    referenceAnswer: string;
    userAnswer: string;
  }): Promise<{ score: number; reason: string }> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SCORING_PROMPT },
        { role: 'user', content: JSON.stringify(params) },
      ],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content!);
  }

  async generateAnalysisReport(examData: ExamDataForAnalysis): Promise<AnalysisReport> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: JSON.stringify(examData) },
      ],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content!);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

#### ScoringEngine

```typescript
// packages/backend/src/services/scoring.engine.ts

export class ScoringEngine {
  /**
   * 客观题本地判分
   */
  scoreObjectiveQuestion(question: Question, userAnswer: string): ScoringResult {
    switch (question.type) {
      case 'single_choice':
      case 'true_false':
        return this.scoreExactMatch(question, userAnswer);
      case 'multiple_choice':
        return this.scoreSetMatch(question, userAnswer);
      case 'fill_blank':
        return this.scoreTrimmedMatch(question, userAnswer);
      default:
        throw new Error(`Unsupported question type for local scoring: ${question.type}`);
    }
  }

  private scoreExactMatch(question: Question, userAnswer: string): ScoringResult {
    const isCorrect = userAnswer === question.correctAnswer;
    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }

  private scoreSetMatch(question: Question, userAnswer: string): ScoringResult {
    const userSet = new Set(userAnswer.split(',').sort());
    const correctSet = new Set(question.correctAnswer.split(',').sort());
    const isCorrect = userSet.size === correctSet.size &&
      [...userSet].every(item => correctSet.has(item));
    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }

  private scoreTrimmedMatch(question: Question, userAnswer: string): ScoringResult {
    const isCorrect = userAnswer.trim() === question.correctAnswer.trim();
    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }
}
```

#### AnalyticsEngine

```typescript
// packages/backend/src/services/analytics.engine.ts

export class AnalyticsEngine {
  constructor(private db: Database) {}

  async getSubjectAnalytics(subjectId: string, range?: '7d' | '30d' | 'all'): Promise<AnalyticsData> {
    const dateFilter = this.getDateFilter(range);

    const sessions = await this.db
      .select()
      .from(examSessions)
      .where(and(
        eq(examSessions.subjectId, subjectId),
        eq(examSessions.status, 'scored'),
        dateFilter,
      ));

    const totalExams = sessions.length;
    const averageScoreRate = totalExams > 0
      ? sessions.reduce((sum, s) => sum + (s.totalScore! / s.maxScore!), 0) / totalExams
      : 0;

    const knowledgeMastery = await this.calculateKnowledgeMastery(subjectId, dateFilter);
    const scoreTrend = sessions.map(s => ({
      date: s.submittedAt!,
      scoreRate: s.totalScore! / s.maxScore!,
    }));

    return { subjectId, totalExams, averageScoreRate, knowledgeMastery, scoreTrend };
  }

  private getDateFilter(range?: '7d' | '30d' | 'all') {
    if (!range || range === 'all') return undefined;
    const days = range === '7d' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return gte(examSessions.submittedAt, since);
  }

  private async calculateKnowledgeMastery(subjectId: string, dateFilter: any) {
    // 按知识点聚合答题正确率
    // ...
  }
}
```

### 前端组件设计

#### 页面结构

```
App
├── Layout
│   ├── Sidebar (学科切换 + 导航)
│   └── MainContent
│       ├── MaterialsPage (资料管理)
│       ├── QuestionsPage (题库管理)
│       ├── ExamPage (答题系统)
│       ├── ResultPage (判分结果)
│       ├── AnalyticsPage (学习进度)
│       └── SettingsPage (API 配置)
```

#### 核心页面组件

```typescript
// packages/frontend/src/pages/ExamPage.tsx

interface ExamPageProps {
  sessionId: string;
}

// 答题页面：根据题型渲染不同的答题组件
// - SingleChoiceQuestion: 单选按钮组
// - MultipleChoiceQuestion: 复选框组
// - TrueFalseQuestion: 正确/错误按钮
// - FillBlankQuestion: 文本输入框
// - ShortAnswerQuestion: 多行文本区域
// 支持题目间自由切换导航
```

```typescript
// packages/frontend/src/pages/AnalyticsPage.tsx

// 学习进度页面：
// - ScoreTrendChart: 使用 Recharts LineChart 展示得分趋势
// - KnowledgeMasteryChart: 使用 Recharts RadarChart 展示知识点掌握分布
// - TimeRangeFilter: 时间范围筛选器（7天/30天/全部）
// - StatsCards: 关键指标卡片（考试次数、平均分等）
```

## Error Handling

### 错误处理策略

| 场景 | 处理方式 |
|------|---------|
| 文件格式不支持 | 前端校验 + 后端校验，返回明确错误信息 |
| 文件大小超限 | 前端预校验 + 后端拒绝，提示具体限制 |
| 文本抽取失败 | Material 状态标记为 `failed`，记录错误原因 |
| DeepSeek API 调用失败 | 返回友好错误提示，保留用户操作上下文 |
| 主观题评分失败 | 客观题正常展示，主观题标记为 `pending_score` |
| 数据库操作失败 | 记录错误日志，返回 500 错误 |
| 端口冲突 | 启动时检测，输出提示信息并退出进程 |

### API 密钥守卫中间件

```typescript
// packages/backend/src/middleware/api-key-guard.ts

export function apiKeyGuard(req: Request, res: Response, next: NextFunction) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'API_KEY_NOT_CONFIGURED',
        message: '请先在设置中配置 DeepSeek API 密钥',
      },
    });
  }
  next();
}
```

### 学科级联删除

```typescript
// packages/backend/src/services/subject.service.ts

export async function deleteSubjectCascade(db: Database, subjectId: string): Promise<void> {
  // 事务内级联删除，确保数据一致性
  db.transaction(() => {
    db.delete(analysisReports).where(eq(analysisReports.subjectId, subjectId));
    db.delete(examAnswers).where(
      inArray(examAnswers.sessionId,
        db.select({ id: examSessions.id }).from(examSessions)
          .where(eq(examSessions.subjectId, subjectId))
      )
    );
    db.delete(examSessions).where(eq(examSessions.subjectId, subjectId));
    db.delete(questions).where(eq(questions.subjectId, subjectId));
    db.delete(knowledgePoints).where(eq(knowledgePoints.subjectId, subjectId));
    db.delete(materials).where(eq(materials.subjectId, subjectId));
    db.delete(subjects).where(eq(subjects.id, subjectId));
  });
}
```

## Testing Strategy

| 测试类型 | 工具 | 覆盖范围 |
|---------|------|---------|
| 单元测试 | Vitest | ScoringEngine、AnalyticsEngine、文件验证逻辑 |
| 属性测试 | fast-check + Vitest | 判分算法、数据隔离、分析计算 |
| 集成测试 | Vitest + supertest | API 端点、数据库操作、文件上传流程 |
| 前端测试 | Vitest + React Testing Library | 组件渲染、用户交互 |

- **属性测试**：针对判分引擎、数据隔离、分析计算等核心逻辑，使用 fast-check 生成随机输入验证不变量
- **单元测试**：针对具体示例和边界条件（空文件、API 失败等）
- **集成测试**：验证 API 端点完整流程、数据库事务、外部服务 Mock

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File upload validation rejects invalid files

*For any* file whose MIME type is not `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, or whose size exceeds the configured maximum, the `validateUploadFile` function SHALL return `{ valid: false }` with an appropriate error message.

**Validates: Requirements 1.3, 1.4**

### Property 2: Generated question structure completeness

*For any* Question produced by the Question_Generator, it SHALL contain a non-empty `stem`, a non-empty `correctAnswer`, and a non-empty `explanation` field.

**Validates: Requirements 4.4**

### Property 3: Choice questions have sufficient options

*For any* Question of type `single_choice` or `multiple_choice`, the `options` array SHALL contain at least 4 elements.

**Validates: Requirements 4.5**

### Property 4: Single choice and true/false scoring is binary exact match

*For any* Question of type `single_choice` or `true_false`, and *for any* user answer string, the ScoringEngine SHALL return a score of 1 (full marks) if and only if the user answer exactly equals the correct answer, and 0 otherwise.

**Validates: Requirements 6.2**

### Property 5: Multiple choice scoring is binary set match

*For any* Question of type `multiple_choice`, and *for any* user answer (comma-separated option set), the ScoringEngine SHALL return a score of 1 if and only if the set of user-selected options is identical to the set of correct options, and 0 otherwise.

**Validates: Requirements 6.3**

### Property 6: Fill-in-blank scoring ignores leading/trailing whitespace

*For any* Question of type `fill_blank`, and *for any* user answer string, the ScoringEngine SHALL return a score of 1 if and only if `userAnswer.trim() === correctAnswer.trim()`, and 0 otherwise.

**Validates: Requirements 6.4**

### Property 7: Subject data isolation

*For any* two distinct Subjects A and B, querying Materials, Questions, or ExamSessions for Subject A SHALL never return records belonging to Subject B.

**Validates: Requirements 8.3, 8.4**

### Property 8: Cascade delete completeness

*For any* Subject that is deleted, after deletion there SHALL be zero records in Materials, Questions, KnowledgePoints, ExamSessions, ExamAnswers, and AnalysisReports tables referencing that Subject's ID.

**Validates: Requirements 8.5**

### Property 9: Analytics metrics correctness

*For any* Subject with one or more scored ExamSessions, the computed `averageScoreRate` SHALL equal the arithmetic mean of all session score rates (`totalScore / maxScore`), and `totalExams` SHALL equal the count of scored sessions.

**Validates: Requirements 9.1**

### Property 10: Time range filter correctness

*For any* time range filter (7d, 30d, all) applied to analytics trend data, all returned data points SHALL have a `submittedAt` timestamp within the specified range, and no data points outside the range SHALL be included.

**Validates: Requirements 9.5**

### Property 11: API key guard blocks unconfigured AI operations

*For any* API endpoint that requires AI service (analyze, generate, score-subjective, analyze-report), if no API key is configured, the endpoint SHALL return a 403 response with error code `API_KEY_NOT_CONFIGURED`.

**Validates: Requirements 11.3**

### Property 12: Exam submission records all answers

*For any* Exam_Session submission containing N answered questions, after submission the database SHALL contain exactly N ExamAnswer records associated with that session, each with a non-null `userAnswer` field.

**Validates: Requirements 5.7**

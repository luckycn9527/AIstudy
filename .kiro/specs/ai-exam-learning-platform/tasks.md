# Implementation Plan: AI 考试学习平台

## Overview

基于 Node.js + Express + React + Vite 的本地单用户 Web 应用，采用 monorepo 结构。后端使用 TypeScript + Drizzle ORM + better-sqlite3，前端使用 React 18 + TypeScript + Recharts。AI 服务通过 OpenAI SDK 兼容模式调用 DeepSeek API。所有任务使用 TypeScript 实现。

## Tasks

- [x] 1. 项目初始化与 Monorepo 结构搭建
  - [x] 1.1 创建 Monorepo 根配置
    - 初始化根目录 `package.json`（workspaces 配置指向 `packages/*`）
    - 创建 `tsconfig.base.json` 共享 TypeScript 配置
    - 创建 `.gitignore`、`.nvmrc`（Node 20）
    - 创建 `data/` 目录结构（`data/uploads/`）
    - _Requirements: 10.4, 12.1_

  - [x] 1.2 初始化后端包 `packages/backend`
    - 创建 `packages/backend/package.json`，添加依赖：express, better-sqlite3, drizzle-orm, pdf-parse, mammoth, openai, multer, uuid, cors
    - 创建 `packages/backend/tsconfig.json` 继承根配置
    - 创建目录结构：`src/routes/`, `src/services/`, `src/db/`, `src/processors/`, `src/middleware/`
    - 创建 `src/index.ts` 入口文件（Express 服务启动、端口冲突检测）
    - _Requirements: 10.1, 12.1, 12.4_

  - [x] 1.3 初始化前端包 `packages/frontend`
    - 使用 Vite + React + TypeScript 模板创建 `packages/frontend`
    - 添加依赖：axios, recharts, react-router-dom
    - 配置 Vite 代理到后端 API
    - _Requirements: 12.2_

  - [x] 1.4 配置测试框架
    - 在后端包添加 vitest、fast-check、supertest 依赖
    - 创建 `packages/backend/vitest.config.ts`
    - 在前端包添加 vitest、@testing-library/react 依赖
    - 创建 `packages/frontend/vitest.config.ts`
    - _Requirements: Testing Strategy_

- [x] 2. 数据库 Schema 与数据访问层
  - [x] 2.1 实现 Drizzle ORM Schema 定义
    - 创建 `packages/backend/src/db/schema.ts`，定义所有表：subjects, materials, knowledgePoints, questions, examSessions, examAnswers, analysisReports, config
    - 确保外键关系正确定义
    - _Requirements: 10.1, 10.2_

  - [x] 2.2 实现数据库初始化与迁移
    - 创建 `packages/backend/src/db/index.ts`，实现数据库连接与自动建表逻辑
    - 使用 drizzle-kit 生成迁移或使用 `db.run(CREATE TABLE ...)` 自动初始化
    - 数据库文件路径指向 `data/db.sqlite`
    - 首次启动时自动创建数据库文件和表结构
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 2.3 实现核心类型定义
    - 创建 `packages/backend/src/types.ts`，定义 QuestionType, MaterialStatus, ExamStatus, AnswerStatus 等类型
    - 定义 GenerateQuestionsParams, ScoringResult, AnalyticsData 等接口
    - _Requirements: 4.2, 6.1_

- [x] 3. Checkpoint - 确保项目结构和数据库初始化正常
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 后端核心服务 - DocumentProcessor 与文件上传
  - [x] 4.1 实现文件上传验证服务
    - 创建 `packages/backend/src/services/upload.service.ts`
    - 实现 `validateUploadFile` 函数：校验 MIME 类型（仅 PDF/DOCX）和文件大小（≤50MB）
    - 返回 `{ valid, error }` 结构
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 4.2 编写文件上传验证属性测试
    - **Property 1: File upload validation rejects invalid files**
    - 使用 fast-check 生成随机 MIME 类型和文件大小，验证非法文件被拒绝、合法文件被接受
    - **Validates: Requirements 1.3, 1.4**

  - [x] 4.3 实现 DocumentProcessor
    - 创建 `packages/backend/src/processors/document.processor.ts`
    - 实现 `extractText(filePath, fileType)` 方法
    - PDF 使用 pdf-parse，Word 使用 mammoth
    - 错误处理：抽取失败时抛出明确异常
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.4 编写 DocumentProcessor 单元测试
    - 测试 PDF 文本抽取（使用测试 PDF 文件）
    - 测试 Word 文本抽取（使用测试 DOCX 文件）
    - 测试异常文件处理
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 5. 后端核心服务 - AIService
  - [x] 5.1 实现 AIService 基础类
    - 创建 `packages/backend/src/services/ai.service.ts`
    - 使用 OpenAI SDK 兼容模式连接 DeepSeek API（baseURL: `https://api.deepseek.com`）
    - 实现 `testConnection()` 方法
    - _Requirements: 11.1, 11.4_

  - [x] 5.2 实现知识点分析功能
    - 在 AIService 中实现 `analyzeKnowledgePoints(text)` 方法
    - 设计 system prompt 引导 AI 提取结构化知识点列表
    - 使用 `response_format: { type: 'json_object' }` 确保返回 JSON
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.3 实现考题生成功能
    - 在 AIService 中实现 `generateQuestions(params)` 方法
    - 支持按题型数量分布生成：单选、多选、判断、填空、简答
    - 确保生成结果包含 stem、correctAnswer、explanation、options（选择题）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 5.4 实现主观题评分功能
    - 在 AIService 中实现 `scoreSubjectiveAnswer(params)` 方法
    - 输入：题干、参考答案、用户作答；输出：分数和评分理由
    - _Requirements: 6.5, 6.6_

  - [x] 5.5 实现考后分析报告功能
    - 在 AIService 中实现 `generateAnalysisReport(examData)` 方法
    - 输出：薄弱知识点列表、错题原因分析、针对性提升建议
    - _Requirements: 7.1, 7.2_

- [x] 6. 后端核心服务 - ScoringEngine
  - [x] 6.1 实现 ScoringEngine 判分逻辑
    - 创建 `packages/backend/src/services/scoring.engine.ts`
    - 实现 `scoreObjectiveQuestion(question, userAnswer)` 方法
    - 单选题/判断题：精确匹配
    - 多选题：集合匹配（逗号分隔，排序后比较）
    - 填空题：trim 后精确匹配
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.2 编写单选题/判断题判分属性测试
    - **Property 4: Single choice and true/false scoring is binary exact match**
    - 使用 fast-check 生成随机答案对，验证精确匹配得 1 分，不匹配得 0 分
    - **Validates: Requirements 6.2**

  - [ ]* 6.3 编写多选题判分属性测试
    - **Property 5: Multiple choice scoring is binary set match**
    - 使用 fast-check 生成随机选项集合，验证集合完全一致得 1 分，否则得 0 分
    - **Validates: Requirements 6.3**

  - [ ]* 6.4 编写填空题判分属性测试
    - **Property 6: Fill-in-blank scoring ignores leading/trailing whitespace**
    - 使用 fast-check 生成带随机空格的答案，验证 trim 后匹配逻辑
    - **Validates: Requirements 6.4**

- [x] 7. 后端核心服务 - AnalyticsEngine
  - [x] 7.1 实现 AnalyticsEngine 统计逻辑
    - 创建 `packages/backend/src/services/analytics.engine.ts`
    - 实现 `getSubjectAnalytics(subjectId, range)` 方法
    - 计算：已完成考试次数、平均得分率、各知识点掌握率、得分趋势
    - 支持时间范围筛选（7d、30d、all）
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 7.2 编写分析指标正确性属性测试
    - **Property 9: Analytics metrics correctness**
    - 使用 fast-check 生成随机考试会话数据，验证 averageScoreRate 等于算术平均值
    - **Validates: Requirements 9.1**

  - [ ]* 7.3 编写时间范围过滤属性测试
    - **Property 10: Time range filter correctness**
    - 使用 fast-check 生成随机时间戳数据，验证过滤结果均在指定范围内
    - **Validates: Requirements 9.5**

- [x] 8. Checkpoint - 确保所有核心服务单元测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. 后端 API 路由 - 学科与资料管理
  - [x] 9.1 实现学科管理路由
    - 创建 `packages/backend/src/routes/subjects.ts`
    - GET `/api/subjects` - 获取所有学科
    - POST `/api/subjects` - 创建学科
    - DELETE `/api/subjects/:id` - 级联删除学科
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [ ]* 9.2 编写学科数据隔离属性测试
    - **Property 7: Subject data isolation**
    - 使用 fast-check 生成多学科数据，验证查询结果不会跨学科泄漏
    - **Validates: Requirements 8.3, 8.4**

  - [ ]* 9.3 编写级联删除完整性属性测试
    - **Property 8: Cascade delete completeness**
    - 使用 fast-check 生成学科及关联数据，删除后验证所有关联表无残留记录
    - **Validates: Requirements 8.5**

  - [x] 9.4 实现资料上传与管理路由
    - 创建 `packages/backend/src/routes/materials.ts`
    - GET `/api/subjects/:subjectId/materials` - 获取资料列表
    - POST `/api/subjects/:subjectId/materials/upload` - 上传文件（multer 中间件）
    - POST `/api/materials/:id/analyze` - 触发 AI 分析
    - GET `/api/materials/:id/knowledge-points` - 获取知识点
    - 上传后异步触发文本抽取，更新 Material 状态
    - _Requirements: 1.1, 1.2, 1.5, 2.3, 2.4, 3.1, 3.2, 3.3_

- [x] 10. 后端 API 路由 - 题库与答题系统
  - [x] 10.1 实现题库管理路由
    - 创建 `packages/backend/src/routes/questions.ts`
    - GET `/api/subjects/:subjectId/questions` - 获取题目列表
    - POST `/api/subjects/:subjectId/questions/generate` - AI 生成考题
    - _Requirements: 4.1, 4.3, 4.6_

  - [ ]* 10.2 编写生成题目结构完整性属性测试
    - **Property 2: Generated question structure completeness**
    - 验证生成的每道题都包含非空 stem、correctAnswer、explanation
    - **Validates: Requirements 4.4**

  - [ ]* 10.3 编写选择题选项数量属性测试
    - **Property 3: Choice questions have sufficient options**
    - 验证单选题和多选题的 options 数组至少包含 4 个元素
    - **Validates: Requirements 4.5**

  - [x] 10.4 实现答题与判分路由
    - 创建 `packages/backend/src/routes/exams.ts`
    - POST `/api/subjects/:subjectId/exams` - 创建考试会话
    - GET `/api/exams/:id` - 获取考试详情
    - POST `/api/exams/:id/submit` - 提交答卷并触发判分
    - GET `/api/exams/:id/result` - 获取判分结果
    - POST `/api/exams/:id/analyze` - 触发考后分析
    - GET `/api/exams/:id/report` - 获取分析报告
    - _Requirements: 5.1, 5.7, 6.1, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 10.5 编写答卷提交记录完整性属性测试
    - **Property 12: Exam submission records all answers**
    - 使用 fast-check 生成随机答题数据，验证提交后数据库记录数量与答题数一致
    - **Validates: Requirements 5.7**

- [x] 11. 后端 API 路由 - 进度统计与系统配置
  - [x] 11.1 实现学习进度路由
    - 创建 `packages/backend/src/routes/analytics.ts`
    - GET `/api/subjects/:subjectId/analytics` - 获取进度统计
    - GET `/api/subjects/:subjectId/analytics/trend` - 获取得分趋势（支持 ?range 参数）
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 11.2 实现系统配置路由
    - 创建 `packages/backend/src/routes/config.ts`
    - GET `/api/config/api-key-status` - 获取密钥配置状态
    - POST `/api/config/api-key` - 保存 API 密钥（加密存储）
    - POST `/api/config/api-key/test` - 测试 API 连接
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 11.3 实现 API 密钥守卫中间件
    - 创建 `packages/backend/src/middleware/api-key-guard.ts`
    - 对需要 AI 服务的路由（analyze, generate, score-subjective, analyze-report）应用守卫
    - 未配置密钥时返回 403 + `API_KEY_NOT_CONFIGURED`
    - _Requirements: 11.3_

  - [ ]* 11.4 编写 API 密钥守卫属性测试
    - **Property 11: API key guard blocks unconfigured AI operations**
    - 验证未配置密钥时所有 AI 相关端点返回 403
    - **Validates: Requirements 11.3**

- [x] 12. Checkpoint - 确保所有后端 API 路由和集成测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. 前端基础架构与布局
  - [x] 13.1 实现应用布局与路由
    - 创建 `packages/frontend/src/App.tsx` 配置 React Router
    - 创建 `packages/frontend/src/components/Layout.tsx`（侧边栏 + 主内容区）
    - 实现学科切换侧边栏组件
    - 创建 API 服务封装 `packages/frontend/src/services/api.ts`（Axios 实例）
    - _Requirements: 8.2, 8.3, 12.2_

  - [x] 13.2 实现学科管理页面
    - 创建学科列表展示、新建学科对话框、删除确认对话框
    - 学科切换时更新全局状态，仅展示当前学科数据
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

- [x] 14. 前端页面 - 资料管理与题库
  - [x] 14.1 实现资料管理页面
    - 创建 `packages/frontend/src/pages/MaterialsPage.tsx`
    - 文件上传组件（前端格式/大小预校验）
    - 资料列表展示（名称、上传时间、处理状态）
    - AI 分析触发按钮、知识点摘要展示
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4, 3.3_

  - [x] 14.2 实现题库管理页面
    - 创建 `packages/frontend/src/pages/QuestionsPage.tsx`
    - 题目列表展示（按题型筛选）
    - 考题生成表单（选择资料、指定题型数量分布）
    - 生成进度展示
    - _Requirements: 4.1, 4.3, 4.6, 4.7_

- [x] 15. 前端页面 - 答题系统与判分结果
  - [x] 15.1 实现答题页面
    - 创建 `packages/frontend/src/pages/ExamPage.tsx`
    - 实现五种题型答题组件：SingleChoiceQuestion、MultipleChoiceQuestion、TrueFalseQuestion、FillBlankQuestion、ShortAnswerQuestion
    - 题目导航栏（支持自由切换）
    - 提交答卷按钮
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 15.2 实现判分结果页面
    - 创建 `packages/frontend/src/pages/ResultPage.tsx`
    - 展示总分、各题得分、正确答案和解析
    - 主观题 pending_score 状态展示
    - 考后分析报告展示（薄弱知识点、错题分析、提升建议）
    - 手动重新触发分析按钮
    - _Requirements: 6.7, 6.8, 7.2, 7.3, 7.4_

- [x] 16. 前端页面 - 学习进度与系统设置
  - [x] 16.1 实现学习进度页面
    - 创建 `packages/frontend/src/pages/AnalyticsPage.tsx`
    - ScoreTrendChart：Recharts LineChart 展示得分趋势
    - KnowledgeMasteryChart：Recharts RadarChart 展示知识点掌握分布
    - TimeRangeFilter：时间范围筛选器（7天/30天/全部）
    - StatsCards：关键指标卡片
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 16.2 实现系统设置页面
    - 创建 `packages/frontend/src/pages/SettingsPage.tsx`
    - API 密钥输入与保存
    - 连接测试按钮与结果展示
    - 未配置密钥时的全局提示
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 17. Checkpoint - 确保前端页面渲染和交互正常
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. 集成与端到端验证
  - [x] 18.1 实现后端集成测试
    - 使用 supertest 测试完整 API 流程：创建学科 → 上传资料 → 生成题目 → 创建考试 → 提交答卷 → 获取结果
    - Mock DeepSeek API 调用
    - 验证数据库状态一致性
    - _Requirements: 1.1, 4.1, 5.1, 5.7, 6.1, 6.7_

  - [x] 18.2 前后端联调与错误处理验证
    - 验证前端 API 调用与后端响应格式一致
    - 验证错误提示信息正确展示（格式错误、大小超限、API 失败等）
    - 验证 API 密钥未配置时的提示流程
    - _Requirements: 1.3, 1.4, 3.4, 4.7, 6.8, 7.4, 11.3_

- [x] 19. Final Checkpoint - 确保所有测试通过，系统可正常启动
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (12 properties total)
- Unit tests validate specific examples and edge cases
- DeepSeek API 调用在测试中使用 Mock，避免依赖外部服务
- 前端测试使用 React Testing Library 验证组件渲染和交互
- 数据库测试使用内存 SQLite 或临时文件，测试后清理

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["4.1", "4.3", "5.1"] },
    { "id": 5, "tasks": ["4.2", "4.4", "5.2", "5.3", "5.4", "5.5", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "9.1", "9.4"] },
    { "id": 8, "tasks": ["9.2", "9.3", "10.1", "10.4", "11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["10.2", "10.3", "10.5", "11.4"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["13.2", "14.1", "14.2"] },
    { "id": 12, "tasks": ["15.1", "15.2", "16.1", "16.2"] },
    { "id": 13, "tasks": ["18.1", "18.2"] }
  ]
}
```

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ═══════════════════════════════════════════════════════════════════════════════
// 学科表
// ═══════════════════════════════════════════════════════════════════════════════
export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 资料表
// ═══════════════════════════════════════════════════════════════════════════════
export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  /** 资料类型: textbook|notes|slides|exam_paper|answer_sheet|cheat_sheet|formula_sheet|wrong_questions|summary|reference */
  materialType: text('material_type').notNull().default('reference'),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  status: text('status').notNull(),
  extractedText: text('extracted_text'),
  errorMessage: text('error_message'),
  examYear: text('exam_year'),
  source: text('source'),
  /** 资料权重 1-10 */
  weight: integer('weight').notNull().default(5),
  uploadedAt: text('uploaded_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 语义切片表 — 知识块级切片 + Embedding 预留
// ═══════════════════════════════════════════════════════════════════════════════
export const semanticChunks = sqliteTable('semantic_chunks', {
  id: text('id').primaryKey(),
  materialId: text('material_id').notNull().references(() => materials.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  /** 切片类型: concept|definition|formula|theorem|example|exercise|explanation|conclusion|prerequisite|methodology */
  chunkType: text('chunk_type').notNull().default('explanation'),
  /** 认知层级 (Bloom): remember|understand|apply|analyze|evaluate|create */
  cognitiveLevel: text('cognitive_level').notNull().default('understand'),
  tokens: integer('tokens').notNull().default(0),
  difficulty: integer('difficulty').notNull().default(3),
  importance: integer('importance').notNull().default(5),
  /** 前置知识 (JSON: string[]) */
  prerequisites: text('prerequisites'),
  sortOrder: integer('sort_order').notNull().default(0),
  // ─── Embedding 预留 (RAG) ───
  embedding: text('embedding'),
  embeddingModel: text('embedding_model'),
  semanticHash: text('semantic_hash'),
  createdAt: text('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 知识点表
// ═══════════════════════════════════════════════════════════════════════════════
export const knowledgePoints = sqliteTable('knowledge_points', {
  id: text('id').primaryKey(),
  materialId: text('material_id').notNull().references(() => materials.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  title: text('title').notNull(),
  description: text('description'),
  weight: integer('weight').notNull().default(5),
  difficulty: integer('difficulty').notNull().default(3),
  frequency: integer('frequency').notNull().default(0),
  chapter: text('chapter'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 知识点关系图谱
// ═══════════════════════════════════════════════════════════════════════════════
export const knowledgeRelations = sqliteTable('knowledge_relations', {
  id: text('id').primaryKey(),
  fromKnowledgeId: text('from_knowledge_id').notNull().references(() => knowledgePoints.id),
  toKnowledgeId: text('to_knowledge_id').notNull().references(() => knowledgePoints.id),
  /** 关系类型: prerequisite|belongs_to|related_to|derived_from|similar_to|conflicts_with */
  relationType: text('relation_type').notNull(),
  /** 关联强度 0-1 */
  strength: real('strength').notNull().default(0.5),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 题目表 — 认知层级 + 训练单元元数据
// ═══════════════════════════════════════════════════════════════════════════════
export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  materialId: text('material_id').references(() => materials.id),
  type: text('type').notNull(),
  stem: text('stem').notNull(),
  options: text('options'),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation').notNull(),
  knowledgePointId: text('knowledge_point_id').references(() => knowledgePoints.id),
  /** 难度 1-5 */
  difficulty: integer('difficulty').notNull().default(3),
  /** 分值 */
  score: real('question_score').notNull().default(1),
  /** 认知层级 (Bloom): remember|understand|apply|analyze|evaluate|create */
  cognitiveLevel: text('cognitive_level').notNull().default('remember'),
  /** 预计耗时 (秒) */
  estimatedTime: integer('estimated_time'),
  /** 区分度 0-1 (高=能区分好坏学生) */
  discrimination: real('discrimination'),
  /** 全局错误率 0-1 */
  mistakeRate: real('mistake_rate'),
  /** 关联知识点 IDs (JSON: string[]) */
  relatedKnowledgeIds: text('related_knowledge_ids'),
  /** 来源: extracted|generated|manual */
  generationSource: text('generation_source').notNull().default('extracted'),
  /** AI 质量评分 0-10 */
  qualityScore: real('quality_score'),
  chapter: text('chapter'),
  examYear: text('exam_year'),
  source: text('source'),
  createdAt: text('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 考试会话表
// ═══════════════════════════════════════════════════════════════════════════════
export const examSessions = sqliteTable('exam_sessions', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  totalScore: real('total_score'),
  maxScore: real('max_score'),
  startedAt: text('started_at').notNull(),
  submittedAt: text('submitted_at'),
  status: text('status').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 答题记录表
// ═══════════════════════════════════════════════════════════════════════════════
export const examAnswers = sqliteTable('exam_answers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => examSessions.id),
  questionId: text('question_id').notNull().references(() => questions.id),
  userAnswer: text('user_answer'),
  score: real('score'),
  maxScore: real('max_score').notNull().default(1),
  scoringReason: text('scoring_reason'),
  status: text('status').notNull(),
  timeSpent: integer('time_spent'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 错题本 — 间隔重复
// ═══════════════════════════════════════════════════════════════════════════════
export const wrongQuestionBook = sqliteTable('wrong_question_book', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  questionId: text('question_id').notNull().references(() => questions.id),
  firstWrongAt: text('first_wrong_at').notNull(),
  wrongCount: integer('wrong_count').notNull().default(1),
  lastWrongAt: text('last_wrong_at').notNull(),
  masteryLevel: integer('mastery_level').notNull().default(0),
  nextReviewAt: text('next_review_at').notNull(),
  consecutiveCorrect: integer('consecutive_correct').notNull().default(0),
  /** 状态: new|reviewing|mastered */
  status: text('status').notNull().default('new'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 知识掌握度 — 多维度追踪
// ═══════════════════════════════════════════════════════════════════════════════
export const knowledgeMastery = sqliteTable('knowledge_mastery', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  knowledgePointId: text('knowledge_point_id').notNull().references(() => knowledgePoints.id),
  // ─── 多维掌握度 (0-100) ───
  /** 记忆维度 */
  memoryScore: integer('memory_score').notNull().default(0),
  /** 理解维度 */
  understandingScore: integer('understanding_score').notNull().default(0),
  /** 应用维度 */
  applicationScore: integer('application_score').notNull().default(0),
  /** 速度维度 */
  speedScore: integer('speed_score').notNull().default(0),
  /** 稳定性维度 */
  stabilityScore: integer('stability_score').notNull().default(0),
  /** 综合掌握度 (加权平均) */
  masteryLevel: integer('mastery_level').notNull().default(0),
  // ─── 学习状态机 ───
  /** 状态: unknown|seen|understanding|practicing|mastered|stable|forgetting|review_required */
  learningState: text('learning_state').notNull().default('unknown'),
  // ─── 统计 ───
  totalAttempts: integer('total_attempts').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  consecutiveCorrect: integer('consecutive_correct').notNull().default(0),
  avgTimeSpent: real('avg_time_spent'),
  /** 遗忘率 0-1 */
  forgettingRate: real('forgetting_rate').notNull().default(0.5),
  lastAttemptAt: text('last_attempt_at'),
  nextReviewAt: text('next_review_at'),
  updatedAt: text('updated_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI 缓存
// ═══════════════════════════════════════════════════════════════════════════════
export const aiCache = sqliteTable('ai_cache', {
  id: text('id').primaryKey(),
  contentHash: text('content_hash').notNull(),
  promptType: text('prompt_type').notNull(),
  response: text('response').notNull(),
  model: text('model').notNull(),
  tokens: integer('tokens'),
  createdAt: text('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 分析报告表
// ═══════════════════════════════════════════════════════════════════════════════
export const analysisReports = sqliteTable('analysis_reports', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => examSessions.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
  weakPoints: text('weak_points').notNull(),
  errorAnalysis: text('error_analysis').notNull(),
  suggestions: text('suggestions').notNull(),
  createdAt: text('created_at').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 系统配置表
// ═══════════════════════════════════════════════════════════════════════════════
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

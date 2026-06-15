// packages/backend/src/types.ts
// 核心类型定义

// ===== 枚举类型 =====

/** 题目类型 */
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';

/** 资料处理状态 */
export type MaterialStatus = 'uploading' | 'processing' | 'ready' | 'failed';

/** 考试会话状态 */
export type ExamStatus = 'in_progress' | 'submitted' | 'scored' | 'analyzed';

/** 答题记录状态 */
export type AnswerStatus = 'answered' | 'scored' | 'pending_score';

// ===== API 响应类型 =====

/** 成功响应 */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** 错误响应 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ===== 业务接口 =====

/** AI 生成考题参数 */
export interface GenerateQuestionsParams {
  materialIds: string[];
  counts?: Record<QuestionType, number>; // 各题型数量（可选，AI 自动决定）
  mode?: 'extract' | 'generate'; // extract: 从试卷提取; generate: AI 生成新题
}

/** 判分结果 */
export interface ScoringResult {
  questionId: string;
  score: number;
  maxScore: number;
  reason?: string;
}

/** 学习进度统计数据 */
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

// ===== 实体接口 =====

/** 知识点 */
export interface KnowledgePoint {
  id: string;
  title: string;
  description?: string;
}

/** AI 生成的题目结构 */
export interface GeneratedQuestion {
  type: QuestionType;
  stem: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  knowledgePointId?: string;
}

// ===== AI 服务相关接口 =====

/** 考后分析所需的考试数据 */
export interface ExamDataForAnalysis {
  sessionId: string;
  questions: Array<{
    id: string;
    type: QuestionType;
    stem: string;
    correctAnswer: string;
    knowledgePointId?: string;
  }>;
  answers: Array<{
    questionId: string;
    userAnswer: string;
    score: number;
    maxScore: number;
  }>;
}

/** AI 分析报告 */
export interface AnalysisReport {
  weakPoints: string[];
  errorAnalysis: Array<{
    questionId: string;
    reason: string;
  }>;
  suggestions: string[];
}

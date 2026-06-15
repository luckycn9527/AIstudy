// packages/backend/src/services/scoring.engine.ts

import type { QuestionType, ScoringResult } from '../types';

/** 判分引擎所需的题目输入接口 */
export interface ScoringQuestion {
  id: string;
  type: QuestionType;
  correctAnswer: string;
}

/**
 * 客观题本地判分引擎
 *
 * 支持题型：单选题、多选题、判断题、填空题
 * 不支持主观题（简答题），主观题需通过 AI 服务评分
 */
export class ScoringEngine {
  /**
   * 对客观题进行本地自动判分
   */
  scoreObjectiveQuestion(question: ScoringQuestion, userAnswer: string): ScoringResult {
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

  /**
   * 精确匹配判分（单选题、判断题）
   * 用户答案必须与正确答案完全一致才得分
   */
  private scoreExactMatch(question: ScoringQuestion, userAnswer: string): ScoringResult {
    const isCorrect = userAnswer === question.correctAnswer;
    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }

  /**
   * 集合匹配判分（多选题）
   * 用户选项以逗号分隔，排序后与正确答案集合比较，完全一致才得分
   */
  private scoreSetMatch(question: ScoringQuestion, userAnswer: string): ScoringResult {
    const userItems = userAnswer.split(',').map(item => item.trim()).filter(item => item.length > 0).sort();
    const correctItems = question.correctAnswer.split(',').map(item => item.trim()).filter(item => item.length > 0).sort();

    const isCorrect = userItems.length === correctItems.length &&
      userItems.every((item, index) => item === correctItems[index]);

    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }

  /**
   * 去首尾空格后精确匹配判分（填空题）
   * 忽略用户答案和正确答案的首尾空格后进行比较
   */
  private scoreTrimmedMatch(question: ScoringQuestion, userAnswer: string): ScoringResult {
    const isCorrect = userAnswer.trim() === question.correctAnswer.trim();
    return {
      questionId: question.id,
      score: isCorrect ? 1 : 0,
      maxScore: 1,
    };
  }
}

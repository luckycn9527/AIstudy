// packages/backend/src/services/scoring.engine.test.ts

import { describe, it, expect } from 'vitest';
import { ScoringEngine, ScoringQuestion } from './scoring.engine';

describe('ScoringEngine', () => {
  const engine = new ScoringEngine();

  describe('scoreObjectiveQuestion - single_choice', () => {
    const question: ScoringQuestion = {
      id: 'q1',
      type: 'single_choice',
      correctAnswer: 'A',
    };

    it('should return score 1 when answer matches exactly', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A');
      expect(result).toEqual({ questionId: 'q1', score: 1, maxScore: 1 });
    });

    it('should return score 0 when answer does not match', () => {
      const result = engine.scoreObjectiveQuestion(question, 'B');
      expect(result).toEqual({ questionId: 'q1', score: 0, maxScore: 1 });
    });

    it('should be case-sensitive', () => {
      const result = engine.scoreObjectiveQuestion(question, 'a');
      expect(result).toEqual({ questionId: 'q1', score: 0, maxScore: 1 });
    });
  });

  describe('scoreObjectiveQuestion - true_false', () => {
    const question: ScoringQuestion = {
      id: 'q2',
      type: 'true_false',
      correctAnswer: '正确',
    };

    it('should return score 1 when answer matches exactly', () => {
      const result = engine.scoreObjectiveQuestion(question, '正确');
      expect(result).toEqual({ questionId: 'q2', score: 1, maxScore: 1 });
    });

    it('should return score 0 when answer does not match', () => {
      const result = engine.scoreObjectiveQuestion(question, '错误');
      expect(result).toEqual({ questionId: 'q2', score: 0, maxScore: 1 });
    });
  });

  describe('scoreObjectiveQuestion - multiple_choice', () => {
    const question: ScoringQuestion = {
      id: 'q3',
      type: 'multiple_choice',
      correctAnswer: 'A,B,C',
    };

    it('should return score 1 when all options match exactly', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A,B,C');
      expect(result).toEqual({ questionId: 'q3', score: 1, maxScore: 1 });
    });

    it('should return score 1 when options match in different order', () => {
      const result = engine.scoreObjectiveQuestion(question, 'C,A,B');
      expect(result).toEqual({ questionId: 'q3', score: 1, maxScore: 1 });
    });

    it('should return score 0 when options are incomplete', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A,B');
      expect(result).toEqual({ questionId: 'q3', score: 0, maxScore: 1 });
    });

    it('should return score 0 when extra options are selected', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A,B,C,D');
      expect(result).toEqual({ questionId: 'q3', score: 0, maxScore: 1 });
    });

    it('should return score 0 when wrong options are selected', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A,B,D');
      expect(result).toEqual({ questionId: 'q3', score: 0, maxScore: 1 });
    });

    it('should handle whitespace around options', () => {
      const result = engine.scoreObjectiveQuestion(question, 'A, B, C');
      expect(result).toEqual({ questionId: 'q3', score: 1, maxScore: 1 });
    });
  });

  describe('scoreObjectiveQuestion - fill_blank', () => {
    const question: ScoringQuestion = {
      id: 'q4',
      type: 'fill_blank',
      correctAnswer: '光合作用',
    };

    it('should return score 1 when answer matches exactly', () => {
      const result = engine.scoreObjectiveQuestion(question, '光合作用');
      expect(result).toEqual({ questionId: 'q4', score: 1, maxScore: 1 });
    });

    it('should return score 1 when answer has leading/trailing whitespace', () => {
      const result = engine.scoreObjectiveQuestion(question, '  光合作用  ');
      expect(result).toEqual({ questionId: 'q4', score: 1, maxScore: 1 });
    });

    it('should return score 0 when answer is different', () => {
      const result = engine.scoreObjectiveQuestion(question, '呼吸作用');
      expect(result).toEqual({ questionId: 'q4', score: 0, maxScore: 1 });
    });

    it('should handle correct answer with whitespace', () => {
      const questionWithSpaces: ScoringQuestion = {
        id: 'q5',
        type: 'fill_blank',
        correctAnswer: '  答案  ',
      };
      const result = engine.scoreObjectiveQuestion(questionWithSpaces, '答案');
      expect(result).toEqual({ questionId: 'q5', score: 1, maxScore: 1 });
    });
  });

  describe('scoreObjectiveQuestion - unsupported type', () => {
    it('should throw error for short_answer type', () => {
      const question: ScoringQuestion = {
        id: 'q6',
        type: 'short_answer',
        correctAnswer: '参考答案',
      };
      expect(() => engine.scoreObjectiveQuestion(question, '用户答案')).toThrow(
        'Unsupported question type for local scoring: short_answer'
      );
    });
  });
});

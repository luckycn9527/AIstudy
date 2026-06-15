// packages/backend/src/services/analytics.engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { AnalyticsEngine } from './analytics.engine';
import { TEST_SCHEMA_SQL } from '../db/test-schema.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(TEST_SCHEMA_SQL);
  return drizzle(sqlite, { schema });
}

describe('AnalyticsEngine', () => {
  let db: ReturnType<typeof createTestDb>;
  let engine: AnalyticsEngine;

  beforeEach(() => {
    db = createTestDb();
    engine = new AnalyticsEngine(db);
  });

  describe('getSubjectAnalytics - empty data', () => {
    it('should return zeros and empty arrays when no sessions exist', async () => {
      // Insert a subject but no sessions
      db.insert(schema.subjects).values({
        id: 'sub1',
        name: '数学',
        createdAt: new Date().toISOString(),
      }).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result).toEqual({
        subjectId: 'sub1',
        totalExams: 0,
        averageScoreRate: 0,
        knowledgeMastery: [],
        scoreTrend: [],
      });
    });

    it('should return zeros when subject has no scored sessions', async () => {
      db.insert(schema.subjects).values({
        id: 'sub1',
        name: '数学',
        createdAt: new Date().toISOString(),
      }).run();

      // Insert an in_progress session (not scored)
      db.insert(schema.examSessions).values({
        id: 'sess1',
        subjectId: 'sub1',
        totalScore: null,
        maxScore: null,
        startedAt: new Date().toISOString(),
        submittedAt: null,
        status: 'in_progress',
      }).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.totalExams).toBe(0);
      expect(result.averageScoreRate).toBe(0);
    });
  });

  describe('getSubjectAnalytics - basic calculations', () => {
    beforeEach(() => {
      db.insert(schema.subjects).values({
        id: 'sub1',
        name: '数学',
        createdAt: '2024-01-01T00:00:00.000Z',
      }).run();
    });

    it('should calculate totalExams correctly', async () => {
      db.insert(schema.examSessions).values([
        {
          id: 'sess1',
          subjectId: 'sub1',
          totalScore: 8,
          maxScore: 10,
          startedAt: '2024-01-10T10:00:00.000Z',
          submittedAt: '2024-01-10T11:00:00.000Z',
          status: 'scored',
        },
        {
          id: 'sess2',
          subjectId: 'sub1',
          totalScore: 9,
          maxScore: 10,
          startedAt: '2024-01-11T10:00:00.000Z',
          submittedAt: '2024-01-11T11:00:00.000Z',
          status: 'analyzed',
        },
      ]).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.totalExams).toBe(2);
    });

    it('should calculate averageScoreRate correctly', async () => {
      db.insert(schema.examSessions).values([
        {
          id: 'sess1',
          subjectId: 'sub1',
          totalScore: 8,
          maxScore: 10,
          startedAt: '2024-01-10T10:00:00.000Z',
          submittedAt: '2024-01-10T11:00:00.000Z',
          status: 'scored',
        },
        {
          id: 'sess2',
          subjectId: 'sub1',
          totalScore: 6,
          maxScore: 10,
          startedAt: '2024-01-11T10:00:00.000Z',
          submittedAt: '2024-01-11T11:00:00.000Z',
          status: 'scored',
        },
      ]).run();

      const result = await engine.getSubjectAnalytics('sub1');

      // (8/10 + 6/10) / 2 = 0.7
      expect(result.averageScoreRate).toBeCloseTo(0.7);
    });

    it('should include both scored and analyzed sessions', async () => {
      db.insert(schema.examSessions).values([
        {
          id: 'sess1',
          subjectId: 'sub1',
          totalScore: 10,
          maxScore: 10,
          startedAt: '2024-01-10T10:00:00.000Z',
          submittedAt: '2024-01-10T11:00:00.000Z',
          status: 'scored',
        },
        {
          id: 'sess2',
          subjectId: 'sub1',
          totalScore: 8,
          maxScore: 10,
          startedAt: '2024-01-11T10:00:00.000Z',
          submittedAt: '2024-01-11T11:00:00.000Z',
          status: 'analyzed',
        },
      ]).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.totalExams).toBe(2);
      // (10/10 + 8/10) / 2 = 0.9
      expect(result.averageScoreRate).toBeCloseTo(0.9);
    });

    it('should calculate scoreTrend sorted by date', async () => {
      db.insert(schema.examSessions).values([
        {
          id: 'sess2',
          subjectId: 'sub1',
          totalScore: 9,
          maxScore: 10,
          startedAt: '2024-01-12T10:00:00.000Z',
          submittedAt: '2024-01-12T11:00:00.000Z',
          status: 'scored',
        },
        {
          id: 'sess1',
          subjectId: 'sub1',
          totalScore: 7,
          maxScore: 10,
          startedAt: '2024-01-10T10:00:00.000Z',
          submittedAt: '2024-01-10T11:00:00.000Z',
          status: 'scored',
        },
      ]).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.scoreTrend).toHaveLength(2);
      expect(result.scoreTrend[0].date).toBe('2024-01-10T11:00:00.000Z');
      expect(result.scoreTrend[0].scoreRate).toBeCloseTo(0.7);
      expect(result.scoreTrend[1].date).toBe('2024-01-12T11:00:00.000Z');
      expect(result.scoreTrend[1].scoreRate).toBeCloseTo(0.9);
    });
  });

  describe('getSubjectAnalytics - time range filtering', () => {
    beforeEach(() => {
      db.insert(schema.subjects).values({
        id: 'sub1',
        name: '数学',
        createdAt: '2024-01-01T00:00:00.000Z',
      }).run();

      const now = Date.now();
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
      const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

      db.insert(schema.examSessions).values([
        {
          id: 'recent',
          subjectId: 'sub1',
          totalScore: 9,
          maxScore: 10,
          startedAt: threeDaysAgo,
          submittedAt: threeDaysAgo,
          status: 'scored',
        },
        {
          id: 'mid',
          subjectId: 'sub1',
          totalScore: 7,
          maxScore: 10,
          startedAt: tenDaysAgo,
          submittedAt: tenDaysAgo,
          status: 'scored',
        },
        {
          id: 'old',
          subjectId: 'sub1',
          totalScore: 5,
          maxScore: 10,
          startedAt: fortyDaysAgo,
          submittedAt: fortyDaysAgo,
          status: 'scored',
        },
      ]).run();
    });

    it('should return all sessions when range is "all"', async () => {
      const result = await engine.getSubjectAnalytics('sub1', 'all');
      expect(result.totalExams).toBe(3);
    });

    it('should return all sessions when range is undefined', async () => {
      const result = await engine.getSubjectAnalytics('sub1');
      expect(result.totalExams).toBe(3);
    });

    it('should filter to last 7 days', async () => {
      const result = await engine.getSubjectAnalytics('sub1', '7d');
      expect(result.totalExams).toBe(1);
      expect(result.averageScoreRate).toBeCloseTo(0.9);
    });

    it('should filter to last 30 days', async () => {
      const result = await engine.getSubjectAnalytics('sub1', '30d');
      expect(result.totalExams).toBe(2);
    });
  });

  describe('getSubjectAnalytics - knowledge mastery', () => {
    beforeEach(() => {
      db.insert(schema.subjects).values({
        id: 'sub1',
        name: '数学',
        createdAt: '2024-01-01T00:00:00.000Z',
      }).run();

      db.insert(schema.materials).values({
        id: 'mat1',
        subjectId: 'sub1',
        fileName: 'test.pdf',
        fileType: 'pdf',
        filePath: '/tmp/test.pdf',
        fileSize: 1024,
        status: 'ready',
        uploadedAt: '2024-01-01T00:00:00.000Z',
      }).run();

      db.insert(schema.knowledgePoints).values([
        { id: 'kp1', materialId: 'mat1', subjectId: 'sub1', title: '微积分' },
        { id: 'kp2', materialId: 'mat1', subjectId: 'sub1', title: '线性代数' },
      ]).run();

      db.insert(schema.questions).values([
        {
          id: 'q1',
          subjectId: 'sub1',
          materialId: 'mat1',
          type: 'single_choice',
          stem: '题目1',
          correctAnswer: 'A',
          explanation: '解析1',
          knowledgePointId: 'kp1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'q2',
          subjectId: 'sub1',
          materialId: 'mat1',
          type: 'single_choice',
          stem: '题目2',
          correctAnswer: 'B',
          explanation: '解析2',
          knowledgePointId: 'kp1',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'q3',
          subjectId: 'sub1',
          materialId: 'mat1',
          type: 'single_choice',
          stem: '题目3',
          correctAnswer: 'C',
          explanation: '解析3',
          knowledgePointId: 'kp2',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]).run();

      db.insert(schema.examSessions).values({
        id: 'sess1',
        subjectId: 'sub1',
        totalScore: 2,
        maxScore: 3,
        startedAt: '2024-01-10T10:00:00.000Z',
        submittedAt: '2024-01-10T11:00:00.000Z',
        status: 'scored',
      }).run();

      db.insert(schema.examAnswers).values([
        { id: 'a1', sessionId: 'sess1', questionId: 'q1', userAnswer: 'A', score: 1, maxScore: 1, status: 'scored' },
        { id: 'a2', sessionId: 'sess1', questionId: 'q2', userAnswer: 'A', score: 0, maxScore: 1, status: 'scored' },
        { id: 'a3', sessionId: 'sess1', questionId: 'q3', userAnswer: 'C', score: 1, maxScore: 1, status: 'scored' },
      ]).run();
    });

    it('should calculate mastery rate per knowledge point', async () => {
      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.knowledgeMastery).toHaveLength(2);

      const calculus = result.knowledgeMastery.find(k => k.title === '微积分');
      const linearAlgebra = result.knowledgeMastery.find(k => k.title === '线性代数');

      // kp1 (微积分): 1/2 correct = 0.5
      expect(calculus).toBeDefined();
      expect(calculus!.masteryRate).toBeCloseTo(0.5);

      // kp2 (线性代数): 1/1 correct = 1.0
      expect(linearAlgebra).toBeDefined();
      expect(linearAlgebra!.masteryRate).toBeCloseTo(1.0);
    });

    it('should not include questions without knowledge points', async () => {
      // Add a question without knowledge point
      db.insert(schema.questions).values({
        id: 'q4',
        subjectId: 'sub1',
        materialId: 'mat1',
        type: 'single_choice',
        stem: '题目4',
        correctAnswer: 'D',
        explanation: '解析4',
        knowledgePointId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      }).run();

      db.insert(schema.examAnswers).values({
        id: 'a4',
        sessionId: 'sess1',
        questionId: 'q4',
        userAnswer: 'D',
        score: 1,
        maxScore: 1,
        status: 'scored',
      }).run();

      const result = await engine.getSubjectAnalytics('sub1');

      // Should still only have 2 knowledge points
      expect(result.knowledgeMastery).toHaveLength(2);
    });
  });

  describe('getSubjectAnalytics - subject isolation', () => {
    it('should only return data for the specified subject', async () => {
      db.insert(schema.subjects).values([
        { id: 'sub1', name: '数学', createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'sub2', name: '英语', createdAt: '2024-01-01T00:00:00.000Z' },
      ]).run();

      db.insert(schema.examSessions).values([
        {
          id: 'sess1',
          subjectId: 'sub1',
          totalScore: 8,
          maxScore: 10,
          startedAt: '2024-01-10T10:00:00.000Z',
          submittedAt: '2024-01-10T11:00:00.000Z',
          status: 'scored',
        },
        {
          id: 'sess2',
          subjectId: 'sub2',
          totalScore: 6,
          maxScore: 10,
          startedAt: '2024-01-11T10:00:00.000Z',
          submittedAt: '2024-01-11T11:00:00.000Z',
          status: 'scored',
        },
      ]).run();

      const result = await engine.getSubjectAnalytics('sub1');

      expect(result.totalExams).toBe(1);
      expect(result.averageScoreRate).toBeCloseTo(0.8);
    });
  });
});

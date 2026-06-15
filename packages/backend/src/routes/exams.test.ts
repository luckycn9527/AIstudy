import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import {
  examAnswers,
  analysisReports,
} from '../db/schema.js';
import { TEST_SCHEMA_SQL } from '../db/test-schema.js';

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle>;

vi.mock('../db/index.js', () => {
  return {
    get db() {
      return testDb;
    },
  };
});

// Mock AIService
vi.mock('../services/ai.service.js', () => {
  return {
    AIService: vi.fn().mockImplementation(() => ({
      scoreSubjectiveAnswer: vi.fn().mockResolvedValue({ score: 0.8, reason: 'AI评分理由' }),
      generateAnalysisReport: vi.fn().mockResolvedValue({
        weakPoints: ['知识点A'],
        errorAnalysis: [{ questionId: 'q1', reason: '概念混淆' }],
        suggestions: ['建议复习知识点A'],
      }),
    })),
  };
});

const { default: examsRouter } = await import('./exams.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(examsRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(TEST_SCHEMA_SQL);
}

function seedTestData() {
  sqlite.pragma('foreign_keys = OFF');
  sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, options, correct_answer, explanation, created_at) VALUES ('q1', 's1', 'single_choice', '1+1=?', '["A. 1","B. 2","C. 3","D. 4"]', 'B', '基础加法', '2024-01-01T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, options, correct_answer, explanation, created_at) VALUES ('q2', 's1', 'true_false', '2>1', NULL, '正确', '基础比较', '2024-01-01T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, created_at) VALUES ('q3', 's1', 'short_answer', '解释什么是质数', '质数是只能被1和自身整除的大于1的自然数', '质数定义', '2024-01-01T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', 'test-key-123')`);
  sqlite.pragma('foreign_keys = ON');
}

describe('Exams Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    seedTestData();
    app = createApp();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('POST /api/subjects/:subjectId/exams', () => {
    it('should create an exam session with questions', async () => {
      const res = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1', 'q2'] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.session.subjectId).toBe('s1');
      expect(res.body.data.session.status).toBe('in_progress');
      expect(res.body.data.questions).toHaveLength(2);

      // Verify exam answers created in DB
      const answers = testDb.select().from(examAnswers).all();
      expect(answers).toHaveLength(2);
      expect(answers[0].status).toBe('answered');
      expect(answers[0].userAnswer).toBeNull();
    });

    it('should reject empty questionIds', async () => {
      const res = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should reject missing questionIds', async () => {
      const res = await request(app)
        .post('/api/subjects/s1/exams')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid question IDs', async () => {
      const res = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1', 'invalid-id'] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('invalid-id');
    });
  });

  describe('GET /api/exams/:id', () => {
    it('should return exam details', async () => {
      // Create a session first
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app).get(`/api/exams/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.session.id).toBe(sessionId);
      expect(res.body.data.questions).toHaveLength(1);
      expect(res.body.data.answers).toHaveLength(1);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app).get('/api/exams/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/exams/:id/submit', () => {
    it('should score objective questions correctly', async () => {
      // Create session
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1', 'q2'] });

      const sessionId = createRes.body.data.session.id;

      // Submit answers
      const res = await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({
          answers: [
            { questionId: 'q1', userAnswer: 'B' },   // correct
            { questionId: 'q2', userAnswer: '正确' }, // correct
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalScore).toBe(2);
      expect(res.body.data.maxScore).toBe(2);
      expect(res.body.data.status).toBe('scored');
      expect(res.body.data.results).toHaveLength(2);
    });

    it('should score incorrect answers as 0', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({
          answers: [{ questionId: 'q1', userAnswer: 'A' }], // wrong
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalScore).toBe(0);
      expect(res.body.data.maxScore).toBe(1);
    });

    it('should use AI scoring for short_answer questions', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q3'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({
          answers: [{ questionId: 'q3', userAnswer: '质数是大于1且只能被1和自身整除的数' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalScore).toBe(0.8);
      expect(res.body.data.results[0].status).toBe('scored');
    });

    it('should reject submission for non-existent session', async () => {
      const res = await request(app)
        .post('/api/exams/non-existent/submit')
        .send({ answers: [{ questionId: 'q1', userAnswer: 'A' }] });

      expect(res.status).toBe(404);
    });

    it('should reject re-submission of already scored exam', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      // First submit
      await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [{ questionId: 'q1', userAnswer: 'B' }] });

      // Second submit should fail
      const res = await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [{ questionId: 'q1', userAnswer: 'A' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('should reject empty answers', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/exams/:id/result', () => {
    it('should return scoring results', async () => {
      // Create and submit
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [{ questionId: 'q1', userAnswer: 'B' }] });

      const res = await request(app).get(`/api/exams/${sessionId}/result`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.session.totalScore).toBe(1);
      expect(res.body.data.answers).toHaveLength(1);
      expect(res.body.data.answers[0].score).toBe(1);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app).get('/api/exams/non-existent/result');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/exams/:id/analyze', () => {
    it('should generate analysis report for scored exam', async () => {
      // Create, submit, then analyze
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [{ questionId: 'q1', userAnswer: 'A' }] });

      const res = await request(app).post(`/api/exams/${sessionId}/analyze`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weakPoints).toEqual(['知识点A']);
      expect(res.body.data.errorAnalysis).toHaveLength(1);
      expect(res.body.data.suggestions).toHaveLength(1);

      // Verify report stored in DB
      const reports = testDb.select().from(analysisReports).all();
      expect(reports).toHaveLength(1);
    });

    it('should reject analysis for in_progress exam', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app).post(`/api/exams/${sessionId}/analyze`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app).post('/api/exams/non-existent/analyze');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/exams/:id/report', () => {
    it('should return analysis report', async () => {
      // Create, submit, analyze, then get report
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      await request(app)
        .post(`/api/exams/${sessionId}/submit`)
        .send({ answers: [{ questionId: 'q1', userAnswer: 'A' }] });

      await request(app).post(`/api/exams/${sessionId}/analyze`);

      const res = await request(app).get(`/api/exams/${sessionId}/report`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weakPoints).toEqual(['知识点A']);
      expect(res.body.data.sessionId).toBe(sessionId);
    });

    it('should return 404 when no report exists', async () => {
      const createRes = await request(app)
        .post('/api/subjects/s1/exams')
        .send({ questionIds: ['q1'] });

      const sessionId = createRes.body.data.session.id;

      const res = await request(app).get(`/api/exams/${sessionId}/report`);
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app).get('/api/exams/non-existent/report');
      expect(res.status).toBe(404);
    });
  });
});

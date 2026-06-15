import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { vi } from 'vitest';
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

// Import router after mock setup
const { default: analyticsRouter } = await import('./analytics.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/subjects', analyticsRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = OFF');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(TEST_SCHEMA_SQL);
}

describe('Analytics Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    app = createApp();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('GET /api/subjects/:subjectId/analytics', () => {
    it('should return empty analytics when no exam sessions exist', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);

      const res = await request(app).get('/api/subjects/s1/analytics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        subjectId: 's1',
        totalExams: 0,
        averageScoreRate: 0,
        knowledgeMastery: [],
        scoreTrend: [],
      });
    });

    it('should return analytics with scored exam sessions', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es1', 's1', 8, 10, '2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z', 'scored')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es2', 's1', 9, 10, '2024-01-02T00:00:00.000Z', '2024-01-02T01:00:00.000Z', 'scored')`);

      const res = await request(app).get('/api/subjects/s1/analytics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subjectId).toBe('s1');
      expect(res.body.data.totalExams).toBe(2);
      expect(res.body.data.averageScoreRate).toBeCloseTo(0.85, 2);
      expect(res.body.data.scoreTrend).toHaveLength(2);
    });

    it('should not include in_progress sessions in analytics', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es1', 's1', 8, 10, '2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z', 'scored')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, started_at, status) VALUES ('es2', 's1', '2024-01-02T00:00:00.000Z', 'in_progress')`);

      const res = await request(app).get('/api/subjects/s1/analytics');
      expect(res.status).toBe(200);
      expect(res.body.data.totalExams).toBe(1);
    });
  });

  describe('GET /api/subjects/:subjectId/analytics/trend', () => {
    it('should return empty trend when no exam sessions exist', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);

      const res = await request(app).get('/api/subjects/s1/analytics/trend');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return score trend data', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es1', 's1', 7, 10, '2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z', 'scored')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es2', 's1', 9, 10, '2024-01-02T00:00:00.000Z', '2024-01-02T01:00:00.000Z', 'scored')`);

      const res = await request(app).get('/api/subjects/s1/analytics/trend');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('date');
      expect(res.body.data[0]).toHaveProperty('scoreRate');
      expect(res.body.data[0].scoreRate).toBeCloseTo(0.7, 2);
      expect(res.body.data[1].scoreRate).toBeCloseTo(0.9, 2);
    });

    it('should support range query parameter', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const oldDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();

      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es1', 's1', 7, 10, '${oldDate}', '${oldDate}', 'scored')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es2', 's1', 9, 10, '${recentDate}', '${recentDate}', 'scored')`);

      const res = await request(app).get('/api/subjects/s1/analytics/trend?range=7d');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Only the recent session should be included
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].scoreRate).toBeCloseTo(0.9, 2);
    });

    it('should reject invalid range parameter', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);

      const res = await request(app).get('/api/subjects/s1/analytics/trend?range=invalid');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_RANGE');
    });

    it('should return all data when range is "all"', async () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date().toISOString();

      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es1', 's1', 7, 10, '${oldDate}', '${oldDate}', 'scored')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES ('es2', 's1', 9, 10, '${recentDate}', '${recentDate}', 'scored')`);

      const res = await request(app).get('/api/subjects/s1/analytics/trend?range=all');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });
});

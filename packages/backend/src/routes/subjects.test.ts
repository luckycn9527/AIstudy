import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
// drizzle-orm eq import removed - not needed in tests
import * as schema from '../db/schema.js';
import {
  subjects,
  materials,
  knowledgePoints,
  questions,
  examSessions,
  examAnswers,
  analysisReports,
} from '../db/schema.js';
import { TEST_SCHEMA_SQL } from '../db/test-schema.js';

// We need to mock the db module before importing the router
import { vi } from 'vitest';

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
const { default: subjectsRouter } = await import('./subjects.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/subjects', subjectsRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(TEST_SCHEMA_SQL);
}

describe('Subjects Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    app = createApp();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('GET /api/subjects', () => {
    it('should return empty array when no subjects exist', async () => {
      const res = await request(app).get('/api/subjects');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [] });
    });

    it('should return all subjects', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s2', '英语', '2024-01-02T00:00:00.000Z')`);

      const res = await request(app).get('/api/subjects');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('数学');
      expect(res.body.data[1].name).toBe('英语');
    });
  });

  describe('POST /api/subjects', () => {
    it('should create a new subject', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({ name: '物理' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('物理');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();

      // Verify it's in the database
      const rows = testDb.select().from(subjects).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('物理');
    });

    it('should trim whitespace from name', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({ name: '  化学  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('化学');
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should reject whitespace-only name', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('DELETE /api/subjects/:id', () => {
    it('should return 404 for non-existent subject', async () => {
      const res = await request(app).delete('/api/subjects/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should delete a subject with no related data', async () => {
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);

      const res = await request(app).delete('/api/subjects/s1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { id: 's1' } });

      // Verify deleted
      const rows = testDb.select().from(subjects).all();
      expect(rows).toHaveLength(0);
    });

    it('should cascade delete all related data', async () => {
      // Set up a subject with full cascade data
      // Disable foreign keys temporarily for easier test data insertion
      sqlite.pragma('foreign_keys = OFF');

      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES ('m1', 's1', 'test.pdf', 'pdf', '/path/test.pdf', 1024, 'ready', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO knowledge_points (id, material_id, subject_id, title) VALUES ('kp1', 'm1', 's1', '知识点1')`);
      sqlite.exec(`INSERT INTO questions (id, subject_id, material_id, type, stem, correct_answer, explanation, created_at) VALUES ('q1', 's1', 'm1', 'single_choice', '题目1', 'A', '解析1', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, started_at, status) VALUES ('es1', 's1', '2024-01-01T00:00:00.000Z', 'scored')`);
      sqlite.exec(`INSERT INTO exam_answers (id, session_id, question_id, user_answer, score, max_score, status) VALUES ('ea1', 'es1', 'q1', 'A', 1, 1, 'scored')`);
      sqlite.exec(`INSERT INTO analysis_reports (id, session_id, subject_id, weak_points, error_analysis, suggestions, created_at) VALUES ('ar1', 'es1', 's1', '[]', '[]', '[]', '2024-01-01T00:00:00.000Z')`);

      sqlite.pragma('foreign_keys = ON');

      const res = await request(app).delete('/api/subjects/s1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify all related data is deleted
      expect(testDb.select().from(subjects).all()).toHaveLength(0);
      expect(testDb.select().from(materials).all()).toHaveLength(0);
      expect(testDb.select().from(knowledgePoints).all()).toHaveLength(0);
      expect(testDb.select().from(questions).all()).toHaveLength(0);
      expect(testDb.select().from(examSessions).all()).toHaveLength(0);
      expect(testDb.select().from(examAnswers).all()).toHaveLength(0);
      expect(testDb.select().from(analysisReports).all()).toHaveLength(0);
    });

    it('should not affect other subjects when deleting', async () => {
      sqlite.pragma('foreign_keys = OFF');

      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1', '数学', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s2', '英语', '2024-01-02T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES ('m1', 's1', 'math.pdf', 'pdf', '/path/math.pdf', 1024, 'ready', '2024-01-01T00:00:00.000Z')`);
      sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES ('m2', 's2', 'eng.pdf', 'pdf', '/path/eng.pdf', 2048, 'ready', '2024-01-02T00:00:00.000Z')`);

      sqlite.pragma('foreign_keys = ON');

      const res = await request(app).delete('/api/subjects/s1');
      expect(res.status).toBe(200);

      // s2 and its material should still exist
      const remainingSubjects = testDb.select().from(subjects).all();
      expect(remainingSubjects).toHaveLength(1);
      expect(remainingSubjects[0].id).toBe('s2');

      const remainingMaterials = testDb.select().from(materials).all();
      expect(remainingMaterials).toHaveLength(1);
      expect(remainingMaterials[0].id).toBe('m2');
    });
  });
});

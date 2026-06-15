import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
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

const { default: dashboardRouter } = await import('./dashboard.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = OFF');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(TEST_SCHEMA_SQL);
}

describe('Dashboard Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    app = createApp();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns empty/zero structure when there is no data', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const d = res.body.data;
    expect(d.overview).toEqual({
      totalStudyMinutes: 0,
      totalCompletedQuestions: 0,
      averageAccuracy: 0,
      totalSubjects: 0,
    });
    expect(d.subjects).toEqual([]);
    expect(d.recentMaterials).toEqual([]);
    expect(d.progressTrend.dates).toHaveLength(7);
    expect(d.progressTrend.bySubject).toEqual([]);
    expect(d.accuracyByCurrent).toEqual([]);
    expect(d.recentExam).toBeNull();
    expect(d.recentReport).toBeNull();
    expect(d.today.todayMinutes).toBe(0);
    expect(d.today.yesterdayMinutes).toBe(0);
    expect(d.today.trendPercent).toBe(0);
    expect(d.today.last7DaysMinutes).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('aggregates subjects, questions, accuracy, and recent materials', async () => {
    sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1','数学','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s2','英语','2024-01-02T00:00:00.000Z')`);

    sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES
      ('m1','s1','a.pdf','pdf','/p/a.pdf',100,'ready','2024-05-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES
      ('m2','s2','b.docx','docx','/p/b.docx',200,'ready','2024-05-02T00:00:00.000Z')`);

    sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, created_at) VALUES
      ('q1','s1','single_choice','题目1','A','解析','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, created_at) VALUES
      ('q2','s1','single_choice','题目2','B','解析','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, created_at) VALUES
      ('q3','s2','single_choice','题目3','A','解析','2024-01-01T00:00:00.000Z')`);

    // Session for s1: 80% accuracy
    sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES
      ('es1','s1',8,10,'2024-05-10T10:00:00.000Z','2024-05-10T10:30:00.000Z','scored')`);
    sqlite.exec(`INSERT INTO exam_answers (id, session_id, question_id, user_answer, score, max_score, status) VALUES
      ('ea1','es1','q1','A',1,1,'scored')`);

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);

    const d = res.body.data;
    expect(d.overview.totalSubjects).toBe(2);
    expect(d.overview.totalCompletedQuestions).toBe(1);
    expect(d.overview.averageAccuracy).toBeCloseTo(0.8, 5);
    expect(d.overview.totalStudyMinutes).toBe(30);

    const s1 = d.subjects.find((s: any) => s.id === 's1');
    expect(s1.totalQuestions).toBe(2);
    expect(s1.accuracy).toBeCloseTo(0.8, 5);
    const s2 = d.subjects.find((s: any) => s.id === 's2');
    expect(s2.totalQuestions).toBe(1);
    expect(s2.accuracy).toBe(0);

    expect(d.recentMaterials).toHaveLength(2);
    expect(d.recentMaterials[0].id).toBe('m2'); // newest first

    const radarS1 = d.accuracyByCurrent.find((a: any) => a.subjectId === 's1');
    expect(radarS1.accuracy).toBeCloseTo(80, 5);
  });

  it('exposes the most recent scored exam as recentExam', async () => {
    sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1','数学','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES
      ('e1','s1',8,10,'2024-05-10T10:00:00.000Z','2024-05-10T10:30:00.000Z','scored')`);
    sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES
      ('e2','s1',9,10,'2024-05-11T10:00:00.000Z','2024-05-11T10:45:00.000Z','scored')`);

    const res = await request(app).get('/api/dashboard');
    const ex = res.body.data.recentExam;
    expect(ex).not.toBeNull();
    expect(ex.id).toBe('e2');
    expect(ex.subjectName).toBe('数学');
    expect(ex.totalScore).toBe(9);
    expect(ex.maxScore).toBe(10);
    expect(ex.accuracy).toBe(90);
    expect(ex.durationMinutes).toBe(45);
  });

  it('derives strong points from knowledge points with >=80% accuracy', async () => {
    sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1','数学','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES
      ('m1','s1','a.pdf','pdf','/p/a.pdf',100,'ready','2024-05-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO knowledge_points (id, material_id, subject_id, title) VALUES ('kp1','m1','s1','微分方程')`);
    sqlite.exec(`INSERT INTO knowledge_points (id, material_id, subject_id, title) VALUES ('kp2','m1','s1','级数收敛')`);

    sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, knowledge_point_id, created_at) VALUES
      ('q1','s1','single_choice','题目1','A','解析','kp1','2024-01-01T00:00:00.000Z')`);
    sqlite.exec(`INSERT INTO questions (id, subject_id, type, stem, correct_answer, explanation, knowledge_point_id, created_at) VALUES
      ('q2','s1','single_choice','题目2','B','解析','kp2','2024-01-01T00:00:00.000Z')`);

    sqlite.exec(`INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES
      ('e1','s1',1,2,'2024-05-10T10:00:00.000Z','2024-05-10T10:30:00.000Z','analyzed')`);

    sqlite.exec(`INSERT INTO exam_answers (id, session_id, question_id, user_answer, score, max_score, status) VALUES
      ('ea1','e1','q1','A',1,1,'scored')`);
    sqlite.exec(`INSERT INTO exam_answers (id, session_id, question_id, user_answer, score, max_score, status) VALUES
      ('ea2','e1','q2','C',0,1,'scored')`);

    sqlite.exec(`INSERT INTO analysis_reports (id, session_id, subject_id, weak_points, error_analysis, suggestions, created_at) VALUES
      ('ar1','e1','s1','["级数收敛","其他薄弱点"]','[]','[]','2024-05-10T11:00:00.000Z')`);

    const res = await request(app).get('/api/dashboard');
    const r = res.body.data.recentReport;
    expect(r).not.toBeNull();
    expect(r.id).toBe('ar1');
    expect(r.weakPoints).toEqual(['级数收敛', '其他薄弱点']);
    expect(r.strongPoints).toEqual(['微分方程']);
    expect(r.score).toBe(50);
  });

  it('builds 7-day progress trend with 0 for empty days', async () => {
    sqlite.exec(`INSERT INTO subjects (id, name, created_at) VALUES ('s1','数学','2024-01-01T00:00:00.000Z')`);

    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const submittedAt = today.toISOString();
    const startedAt = new Date(today.getTime() - 30 * 60000).toISOString();

    sqlite.exec(
      `INSERT INTO exam_sessions (id, subject_id, total_score, max_score, started_at, submitted_at, status) VALUES
      ('e1','s1',8,10,'${startedAt}','${submittedAt}','scored')`,
    );

    const res = await request(app).get('/api/dashboard');
    const trend = res.body.data.progressTrend;
    expect(trend.dates).toHaveLength(7);
    expect(trend.bySubject).toHaveLength(1);
    expect(trend.bySubject[0].scores).toHaveLength(7);
    // The last (today's) score is 80%, others are 0
    expect(trend.bySubject[0].scores[6]).toBeCloseTo(80, 5);
    expect(trend.bySubject[0].scores.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

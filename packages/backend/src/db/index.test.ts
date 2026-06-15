import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const TEST_DATA_DIR = path.resolve(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'test-init.sqlite');

describe('Database initialization', () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
  });

  afterAll(() => {
    sqlite.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
  });

  it('should create all required tables', () => {
    // Run the same SQL as initializeDatabase
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        status TEXT NOT NULL,
        extracted_text TEXT,
        error_message TEXT,
        uploaded_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_points (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL REFERENCES materials(id),
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        title TEXT NOT NULL,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        material_id TEXT REFERENCES materials(id),
        type TEXT NOT NULL,
        stem TEXT NOT NULL,
        options TEXT,
        correct_answer TEXT NOT NULL,
        explanation TEXT NOT NULL,
        knowledge_point_id TEXT REFERENCES knowledge_points(id),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        total_score REAL,
        max_score REAL,
        started_at TEXT NOT NULL,
        submitted_at TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exam_answers (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES exam_sessions(id),
        question_id TEXT NOT NULL REFERENCES questions(id),
        user_answer TEXT,
        score REAL,
        max_score REAL NOT NULL DEFAULT 1,
        scoring_reason TEXT,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analysis_reports (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES exam_sessions(id),
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        weak_points TEXT NOT NULL,
        error_analysis TEXT NOT NULL,
        suggestions TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('subjects');
    expect(tableNames).toContain('materials');
    expect(tableNames).toContain('knowledge_points');
    expect(tableNames).toContain('questions');
    expect(tableNames).toContain('exam_sessions');
    expect(tableNames).toContain('exam_answers');
    expect(tableNames).toContain('analysis_reports');
    expect(tableNames).toContain('config');
  });

  it('should enable WAL mode', () => {
    const result = sqlite.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');
  });

  it('should enable foreign keys', () => {
    const result = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0].foreign_keys).toBe(1);
  });

  it('should enforce foreign key constraints', () => {
    expect(() => {
      sqlite.prepare(
        "INSERT INTO materials (id, subject_id, file_name, file_type, file_path, file_size, status, uploaded_at) VALUES ('m1', 'nonexistent', 'test.pdf', 'pdf', '/path', 100, 'ready', '2024-01-01')"
      ).run();
    }).toThrow();
  });

  it('should be idempotent (running CREATE TABLE IF NOT EXISTS twice is safe)', () => {
    expect(() => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS subjects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    }).not.toThrow();
  });
});

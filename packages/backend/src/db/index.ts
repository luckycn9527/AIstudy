import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { TEST_SCHEMA_SQL } from './test-schema.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

function ensureDataDirectory(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createConnection(): Database.Database {
  ensureDataDirectory();
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

const sqlite = createConnection();

export const db = drizzle(sqlite, { schema });

export function initializeDatabase(): void {
  // Use the shared schema SQL (single source of truth)
  sqlite.exec(TEST_SCHEMA_SQL);

  // Additional indexes for production performance
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_subject_id ON exam_sessions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_submitted_at ON exam_sessions(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_exam_answers_session_id ON exam_answers(session_id);
    CREATE INDEX IF NOT EXISTS idx_exam_answers_question_id ON exam_answers(question_id);
    CREATE INDEX IF NOT EXISTS idx_materials_subject_id ON materials(subject_id);
    CREATE INDEX IF NOT EXISTS idx_materials_material_type ON materials(material_type);
    CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_material_id ON questions(material_id);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_questions_cognitive_level ON questions(cognitive_level);
    CREATE INDEX IF NOT EXISTS idx_knowledge_points_material_id ON knowledge_points(material_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_points_subject_id ON knowledge_points(subject_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_from ON knowledge_relations(from_knowledge_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_to ON knowledge_relations(to_knowledge_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_reports_session_id ON analysis_reports(session_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_reports_subject_id ON analysis_reports(subject_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_chunks_material_id ON semantic_chunks(material_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_chunks_subject_id ON semantic_chunks(subject_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_chunks_type ON semantic_chunks(chunk_type);
    CREATE INDEX IF NOT EXISTS idx_wrong_question_book_subject_id ON wrong_question_book(subject_id);
    CREATE INDEX IF NOT EXISTS idx_wrong_question_book_question_id ON wrong_question_book(question_id);
    CREATE INDEX IF NOT EXISTS idx_wrong_question_book_next_review ON wrong_question_book(next_review_at);
    CREATE INDEX IF NOT EXISTS idx_wrong_question_book_status ON wrong_question_book(status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_mastery_subject_id ON knowledge_mastery(subject_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_mastery_kp_id ON knowledge_mastery(knowledge_point_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_mastery_state ON knowledge_mastery(learning_state);
    CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON ai_cache(content_hash, prompt_type);

    -- Unique constraints to prevent concurrent duplicate records
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_wrong_question_book ON wrong_question_book(subject_id, question_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_knowledge_mastery ON knowledge_mastery(subject_id, knowledge_point_id);
  `);
}

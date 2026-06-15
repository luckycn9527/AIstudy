/**
 * Shared test database schema SQL.
 * All test files that create their own in-memory DB should use this.
 * Must stay in sync with initializeDatabase() in index.ts.
 */
export const TEST_SCHEMA_SQL = `
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
    material_type TEXT NOT NULL DEFAULT 'reference',
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    status TEXT NOT NULL,
    extracted_text TEXT,
    error_message TEXT,
    exam_year TEXT,
    source TEXT,
    weight INTEGER NOT NULL DEFAULT 5,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS semantic_chunks (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT NOT NULL,
    chunk_type TEXT NOT NULL DEFAULT 'explanation',
    cognitive_level TEXT NOT NULL DEFAULT 'understand',
    tokens INTEGER NOT NULL DEFAULT 0,
    difficulty INTEGER NOT NULL DEFAULT 3,
    importance INTEGER NOT NULL DEFAULT 5,
    prerequisites TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    embedding TEXT,
    embedding_model TEXT,
    semantic_hash TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_points (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    title TEXT NOT NULL,
    description TEXT,
    weight INTEGER NOT NULL DEFAULT 5,
    difficulty INTEGER NOT NULL DEFAULT 3,
    frequency INTEGER NOT NULL DEFAULT 0,
    chapter TEXT
  );

  CREATE TABLE IF NOT EXISTS knowledge_relations (
    id TEXT PRIMARY KEY,
    from_knowledge_id TEXT NOT NULL REFERENCES knowledge_points(id),
    to_knowledge_id TEXT NOT NULL REFERENCES knowledge_points(id),
    relation_type TEXT NOT NULL,
    strength REAL NOT NULL DEFAULT 0.5
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
    difficulty INTEGER NOT NULL DEFAULT 3,
    question_score REAL NOT NULL DEFAULT 1,
    cognitive_level TEXT NOT NULL DEFAULT 'remember',
    estimated_time INTEGER,
    discrimination REAL,
    mistake_rate REAL,
    related_knowledge_ids TEXT,
    generation_source TEXT NOT NULL DEFAULT 'extracted',
    quality_score REAL,
    chapter TEXT,
    exam_year TEXT,
    source TEXT,
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
    status TEXT NOT NULL,
    time_spent INTEGER
  );

  CREATE TABLE IF NOT EXISTS wrong_question_book (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    question_id TEXT NOT NULL REFERENCES questions(id),
    first_wrong_at TEXT NOT NULL,
    wrong_count INTEGER NOT NULL DEFAULT 1,
    last_wrong_at TEXT NOT NULL,
    mastery_level INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT NOT NULL,
    consecutive_correct INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new'
  );

  CREATE TABLE IF NOT EXISTS knowledge_mastery (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    knowledge_point_id TEXT NOT NULL REFERENCES knowledge_points(id),
    memory_score INTEGER NOT NULL DEFAULT 0,
    understanding_score INTEGER NOT NULL DEFAULT 0,
    application_score INTEGER NOT NULL DEFAULT 0,
    speed_score INTEGER NOT NULL DEFAULT 0,
    stability_score INTEGER NOT NULL DEFAULT 0,
    mastery_level INTEGER NOT NULL DEFAULT 0,
    learning_state TEXT NOT NULL DEFAULT 'unknown',
    total_attempts INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    consecutive_correct INTEGER NOT NULL DEFAULT 0,
    avg_time_spent REAL,
    forgetting_rate REAL NOT NULL DEFAULT 0.5,
    last_attempt_at TEXT,
    next_review_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_cache (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    response TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens INTEGER,
    created_at TEXT NOT NULL
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

  CREATE UNIQUE INDEX IF NOT EXISTS uniq_wrong_question_book ON wrong_question_book(subject_id, question_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_knowledge_mastery ON knowledge_mastery(subject_id, knowledge_point_id);
`;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { subjects, materials, questions, examSessions, examAnswers } from '../db/schema.js';
import { TEST_SCHEMA_SQL } from '../db/test-schema.js';

/**
 * 后端集成测试
 * 测试完整 API 流程：创建学科 → 上传资料 → 生成题目 → 创建考试 → 提交答卷 → 获取结果
 * Validates: Requirements 1.1, 4.1, 5.1, 5.7, 6.1, 6.7
 */

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle>;

// Mock the db module
vi.mock('../db/index.js', () => {
  return {
    get db() {
      return testDb;
    },
  };
});

// Mock the DocumentProcessor to avoid real file processing
vi.mock('../processors/document.processor.js', () => {
  return {
    DocumentProcessor: class {
      async extractText(_filePath: string, _fileType: string): Promise<string> {
        return '这是一段关于物理学的测试文本。牛顿第一定律：一个物体如果不受外力作用，将保持静止或匀速直线运动状态。牛顿第二定律：F=ma。牛顿第三定律：作用力与反作用力大小相等方向相反。';
      }
      async extractAndChunk(_filePath: string, _fileType: string) {
        return [{ index: 1, title: '全文', text: '这是一段关于物理学的测试文本。牛顿第一定律：一个物体如果不受外力作用，将保持静止或匀速直线运动状态。牛顿第二定律：F=ma。牛顿第三定律：作用力与反作用力大小相等方向相反。' }];
      }
    },
  };
});

// Mock the AIService to avoid real API calls
vi.mock('../services/ai.service.js', () => {
  return {
    AIService: class {
      async testConnection(): Promise<boolean> {
        return true;
      }

      async analyzeKnowledgePoints(_text: string) {
        return [
          { title: '牛顿第一定律', description: '惯性定律' },
          { title: '牛顿第二定律', description: 'F=ma' },
          { title: '牛顿第三定律', description: '作用力与反作用力' },
        ];
      }

      async generateQuestions(_params: unknown) {
        return [
          {
            type: 'single_choice',
            stem: '牛顿第二定律的公式是？',
            options: ['A. F=ma', 'B. E=mc²', 'C. P=mv', 'D. W=Fs'],
            correctAnswer: 'A',
            explanation: '牛顿第二定律表明力等于质量乘以加速度',
            knowledgePointId: undefined,
          },
          {
            type: 'true_false',
            stem: '牛顿第一定律也叫惯性定律',
            options: undefined,
            correctAnswer: '正确',
            explanation: '牛顿第一定律确实也被称为惯性定律',
            knowledgePointId: undefined,
          },
          {
            type: 'fill_blank',
            stem: '牛顿第三定律指出作用力与反作用力大小____方向相反',
            options: undefined,
            correctAnswer: '相等',
            explanation: '作用力与反作用力大小相等方向相反',
            knowledgePointId: undefined,
          },
        ];
      }

      async scoreSubjectiveAnswer(_params: unknown) {
        return { score: 0.8, reason: 'AI 评分：回答基本正确' };
      }

      async generateAnalysisReport(_examData: unknown) {
        return {
          weakPoints: ['牛顿第三定律'],
          errorAnalysis: [{ questionId: 'q1', reason: '概念混淆' }],
          suggestions: ['建议复习牛顿运动定律'],
        };
      }
    },
  };
});

// Mock multer to avoid real file system operations
vi.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req: any, _res: any, next: any) => {
      // Simulate a file upload
      req.file = {
        originalname: 'physics.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/test-upload.pdf',
        filename: 'test-upload.pdf',
      };
      next();
    },
  });
  multerMock.diskStorage = () => ({});
  return { default: multerMock };
});

// Import routers after mock setup
const { default: subjectsRouter } = await import('../routes/subjects.js');
const { default: materialsRouter } = await import('../routes/materials.js');
const { default: questionsRouter } = await import('../routes/questions.js');
const { default: examsRouter } = await import('../routes/exams.js');
const { default: configRouter } = await import('../routes/config.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(materialsRouter);
  app.use(questionsRouter);
  app.use('/api/subjects', subjectsRouter);
  app.use(examsRouter);
  app.use('/api/config', configRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(TEST_SCHEMA_SQL);
}

describe('Backend Integration Test - 完整 API 流程', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    app = createApp();
    // Pre-configure API key so AI services work
    sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', 'test-api-key-123')`);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('should complete the full flow: create subject → upload material → generate questions → create exam → submit → get result', async () => {
    // ===== Step 1: 创建学科 (Validates: Requirement 1.1 - subject context for materials) =====
    const createSubjectRes = await request(app)
      .post('/api/subjects')
      .send({ name: '物理' });

    expect(createSubjectRes.status).toBe(201);
    expect(createSubjectRes.body.success).toBe(true);
    expect(createSubjectRes.body.data.name).toBe('物理');

    const subjectId = createSubjectRes.body.data.id;
    expect(subjectId).toBeDefined();

    // Verify subject in database
    const subjectRows = testDb.select().from(subjects).all();
    expect(subjectRows).toHaveLength(1);
    expect(subjectRows[0].name).toBe('物理');

    // ===== Step 2: 上传资料 (Validates: Requirement 1.1) =====
    const uploadRes = await request(app)
      .post(`/api/subjects/${subjectId}/materials/upload`)
      .attach('file', Buffer.from('fake pdf content'), {
        filename: 'physics.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.data.fileName).toBe('physics.pdf');
    expect(uploadRes.body.data.subjectId).toBe(subjectId);

    const materialId = uploadRes.body.data.id;
    expect(materialId).toBeDefined();

    // Wait briefly for async text extraction to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify material in database - status should be 'ready' after extraction
    const materialRows = testDb.select().from(materials).all();
    expect(materialRows).toHaveLength(1);
    expect(materialRows[0].subjectId).toBe(subjectId);
    expect(materialRows[0].status).toBe('ready');
    expect(materialRows[0].extractedText).toBeTruthy();

    // ===== Step 3: 触发 AI 分析 (Validates: Requirement 4.1 - prerequisite for question generation) =====
    const analyzeRes = await request(app)
      .post(`/api/materials/${materialId}/analyze`);

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.success).toBe(true);
    expect(analyzeRes.body.data).toHaveLength(3);
    expect(analyzeRes.body.data[0].title).toBe('牛顿第一定律');

    // ===== Step 4: 生成题目 (Validates: Requirement 4.1) =====
    const generateRes = await request(app)
      .post(`/api/subjects/${subjectId}/questions/generate`)
      .send({
        materialIds: [materialId],
        counts: {
          single_choice: 1,
          true_false: 1,
          fill_blank: 1,
          multiple_choice: 0,
          short_answer: 0,
        },
      });

    expect(generateRes.status).toBe(201);
    expect(generateRes.body.success).toBe(true);
    expect(generateRes.body.data).toHaveLength(3);

    // Verify questions in database
    const questionRows = testDb.select().from(questions).all();
    expect(questionRows).toHaveLength(3);
    expect(questionRows.every((q) => q.subjectId === subjectId)).toBe(true);

    const questionIds = generateRes.body.data.map((q: any) => q.id);

    // ===== Step 5: 创建考试 (Validates: Requirement 5.1) =====
    const createExamRes = await request(app)
      .post(`/api/subjects/${subjectId}/exams`)
      .send({ questionIds });

    expect(createExamRes.status).toBe(201);
    expect(createExamRes.body.success).toBe(true);
    expect(createExamRes.body.data.session.status).toBe('in_progress');
    expect(createExamRes.body.data.questions).toHaveLength(3);

    const examId = createExamRes.body.data.session.id;
    expect(examId).toBeDefined();

    // Verify exam session in database
    const sessionRows = testDb.select().from(examSessions).all();
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].status).toBe('in_progress');
    expect(sessionRows[0].subjectId).toBe(subjectId);

    // Verify exam answers created
    const answerRows = testDb.select().from(examAnswers).all();
    expect(answerRows).toHaveLength(3);

    // ===== Step 6: 提交答卷 (Validates: Requirements 5.7, 6.1, 6.7) =====
    const submitRes = await request(app)
      .post(`/api/exams/${examId}/submit`)
      .send({
        answers: [
          { questionId: questionIds[0], userAnswer: 'A' },       // single_choice - correct
          { questionId: questionIds[1], userAnswer: '正确' },    // true_false - correct
          { questionId: questionIds[2], userAnswer: '相等' },    // fill_blank - correct
        ],
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.status).toBe('scored');
    expect(submitRes.body.data.totalScore).toBe(3);
    expect(submitRes.body.data.maxScore).toBe(3);
    expect(submitRes.body.data.results).toHaveLength(3);

    // Verify all answers scored correctly
    for (const result of submitRes.body.data.results) {
      expect(result.score).toBe(1);
      expect(result.maxScore).toBe(1);
      expect(result.status).toBe('scored');
    }

    // Verify database state after submission
    const updatedSession = testDb.select().from(examSessions).all();
    expect(updatedSession[0].status).toBe('scored');
    expect(updatedSession[0].totalScore).toBe(3);
    expect(updatedSession[0].maxScore).toBe(3);
    expect(updatedSession[0].submittedAt).toBeTruthy();

    // ===== Step 7: 获取判分结果 (Validates: Requirement 6.7) =====
    const resultRes = await request(app)
      .get(`/api/exams/${examId}/result`);

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.success).toBe(true);
    expect(resultRes.body.data.session.totalScore).toBe(3);
    expect(resultRes.body.data.session.maxScore).toBe(3);
    expect(resultRes.body.data.session.status).toBe('scored');
    expect(resultRes.body.data.questions).toHaveLength(3);
    expect(resultRes.body.data.answers).toHaveLength(3);

    // Verify each answer has been scored
    for (const answer of resultRes.body.data.answers) {
      expect(answer.score).toBe(1);
      expect(answer.status).toBe('scored');
      expect(answer.userAnswer).toBeTruthy();
    }
  });

  it('should handle incorrect answers and partial scoring', async () => {
    // Create subject
    const subjectRes = await request(app)
      .post('/api/subjects')
      .send({ name: '数学' });
    const subjectId = subjectRes.body.data.id;

    // Upload material
    const uploadRes = await request(app)
      .post(`/api/subjects/${subjectId}/materials/upload`)
      .attach('file', Buffer.from('content'), {
        filename: 'math.pdf',
        contentType: 'application/pdf',
      });
    const materialId = uploadRes.body.data.id;

    // Wait for text extraction
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate questions
    const generateRes = await request(app)
      .post(`/api/subjects/${subjectId}/questions/generate`)
      .send({
        materialIds: [materialId],
        counts: { single_choice: 1, true_false: 1, fill_blank: 1, multiple_choice: 0, short_answer: 0 },
      });
    const questionIds = generateRes.body.data.map((q: any) => q.id);

    // Create exam
    const examRes = await request(app)
      .post(`/api/subjects/${subjectId}/exams`)
      .send({ questionIds });
    const examId = examRes.body.data.session.id;

    // Submit with some wrong answers
    const submitRes = await request(app)
      .post(`/api/exams/${examId}/submit`)
      .send({
        answers: [
          { questionId: questionIds[0], userAnswer: 'B' },       // wrong
          { questionId: questionIds[1], userAnswer: '正确' },    // correct
          { questionId: questionIds[2], userAnswer: '不相等' },  // wrong
        ],
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.totalScore).toBe(1);
    expect(submitRes.body.data.maxScore).toBe(3);

    // Verify individual scores
    const results = submitRes.body.data.results;
    expect(results[0].score).toBe(0); // wrong single_choice
    expect(results[1].score).toBe(1); // correct true_false
    expect(results[2].score).toBe(0); // wrong fill_blank

    // Verify result endpoint
    const resultRes = await request(app).get(`/api/exams/${examId}/result`);
    expect(resultRes.body.data.session.totalScore).toBe(1);
    expect(resultRes.body.data.session.maxScore).toBe(3);
  });

  it('should prevent double submission of an exam', async () => {
    // Create subject and setup
    const subjectRes = await request(app)
      .post('/api/subjects')
      .send({ name: '化学' });
    const subjectId = subjectRes.body.data.id;

    const uploadRes = await request(app)
      .post(`/api/subjects/${subjectId}/materials/upload`)
      .attach('file', Buffer.from('content'), {
        filename: 'chem.pdf',
        contentType: 'application/pdf',
      });
    const materialId = uploadRes.body.data.id;
    await new Promise((resolve) => setTimeout(resolve, 100));

    const generateRes = await request(app)
      .post(`/api/subjects/${subjectId}/questions/generate`)
      .send({
        materialIds: [materialId],
        counts: { single_choice: 1, true_false: 0, fill_blank: 0, multiple_choice: 0, short_answer: 0 },
      });
    const questionIds = generateRes.body.data.map((q: any) => q.id);

    const examRes = await request(app)
      .post(`/api/subjects/${subjectId}/exams`)
      .send({ questionIds });
    const examId = examRes.body.data.session.id;

    // First submission
    await request(app)
      .post(`/api/exams/${examId}/submit`)
      .send({ answers: [{ questionId: questionIds[0], userAnswer: 'A' }] });

    // Second submission should fail
    const secondSubmit = await request(app)
      .post(`/api/exams/${examId}/submit`)
      .send({ answers: [{ questionId: questionIds[0], userAnswer: 'B' }] });

    expect(secondSubmit.status).toBe(400);
    expect(secondSubmit.body.success).toBe(false);
    expect(secondSubmit.body.error.code).toBe('INVALID_STATE');
  });

  it('should maintain data isolation between subjects', async () => {
    // Create two subjects
    const subject1Res = await request(app)
      .post('/api/subjects')
      .send({ name: '物理' });
    const subject1Id = subject1Res.body.data.id;

    const subject2Res = await request(app)
      .post('/api/subjects')
      .send({ name: '化学' });
    const subject2Id = subject2Res.body.data.id;

    // Upload material to subject 1
    const upload1Res = await request(app)
      .post(`/api/subjects/${subject1Id}/materials/upload`)
      .attach('file', Buffer.from('physics'), {
        filename: 'physics.pdf',
        contentType: 'application/pdf',
      });
    const material1Id = upload1Res.body.data.id;
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate questions for subject 1
    await request(app)
      .post(`/api/subjects/${subject1Id}/questions/generate`)
      .send({
        materialIds: [material1Id],
        counts: { single_choice: 1, true_false: 0, fill_blank: 0, multiple_choice: 0, short_answer: 0 },
      });

    // Verify subject 2 has no questions
    const allQuestions = testDb.select().from(questions).all();
    const subject2Questions = allQuestions.filter((q) => q.subjectId === subject2Id);
    expect(subject2Questions).toHaveLength(0);

    // Verify subject 1 has questions
    const subject1Questions = allQuestions.filter((q) => q.subjectId === subject1Id);
    expect(subject1Questions).toHaveLength(3);
  });
});

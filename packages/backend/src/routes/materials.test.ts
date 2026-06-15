import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../services/upload.service.js', () => ({
  validateUploadFile: vi.fn(),
}));

vi.mock('../processors/document.processor.js', () => ({
  DocumentProcessor: vi.fn().mockImplementation(() => ({
    extractText: vi.fn().mockResolvedValue('extracted text content'),
  })),
}));

vi.mock('../services/ai.service.js', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    analyzeKnowledgePoints: vi.fn().mockResolvedValue([
      { title: '知识点1', description: '描述1' },
    ]),
  })),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}));

import { db } from '../db/index.js';
import materialsRouter from './materials.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(materialsRouter);
  return app;
}

describe('Materials Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/subjects/:subjectId/materials', () => {
    it('should return materials list for a subject', async () => {
      const mockMaterials = [
        {
          id: 'mat-1',
          subjectId: 'sub-1',
          fileName: 'test.pdf',
          fileType: 'pdf',
          filePath: '/path/to/test.pdf',
          fileSize: 1024,
          status: 'ready',
          extractedText: 'some text',
          errorMessage: null,
          uploadedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockMaterials);
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({ where: mockWhere }),
      });

      const app = createApp();
      const res = await request(app).get('/api/subjects/sub-1/materials');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockMaterials });
    });

    it('should return 500 on database error', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      });

      const app = createApp();
      const res = await request(app).get('/api/subjects/sub-1/materials');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FETCH_MATERIALS_ERROR');
    });
  });

  describe('POST /api/subjects/:subjectId/materials/upload', () => {
    it('should return 400 when no file is provided', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/subjects/sub-1/materials/upload')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_FILE');
    });
  });

  describe('POST /api/materials/:id/analyze', () => {
    it('should return 404 when material not found', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });

      const app = createApp();
      const res = await request(app).post('/api/materials/non-existent/analyze');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when material is not ready', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'mat-1', status: 'processing', subjectId: 'sub-1' }]),
        }),
      });

      const app = createApp();
      const res = await request(app).post('/api/materials/mat-1/analyze');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_READY');
    });

    it('should return 400 when no API key configured', async () => {
      let callCount = 0;
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // material query
              return Promise.resolve([{
                id: 'mat-1',
                status: 'ready',
                subjectId: 'sub-1',
                extractedText: 'some text',
              }]);
            }
            // config query
            return Promise.resolve([]);
          }),
        })),
      }));

      const app = createApp();
      const res = await request(app).post('/api/materials/mat-1/analyze');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_API_KEY');
    });
  });

  describe('GET /api/materials/:id/knowledge-points', () => {
    it('should return 404 when material not found', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });

      const app = createApp();
      const res = await request(app).get('/api/materials/non-existent/knowledge-points');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return knowledge points for a material', async () => {
      const mockPoints = [
        { id: 'kp-1', materialId: 'mat-1', subjectId: 'sub-1', title: '知识点1', description: '描述1' },
      ];

      let callCount = 0;
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // material existence check
              return Promise.resolve([{ id: 'mat-1', status: 'ready' }]);
            }
            // knowledge points query
            return Promise.resolve(mockPoints);
          }),
        })),
      }));

      const app = createApp();
      const res = await request(app).get('/api/materials/mat-1/knowledge-points');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockPoints);
    });
  });
});

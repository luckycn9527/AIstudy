import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { config } from '../db/schema.js';

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle>;

vi.mock('../db/index.js', () => {
  return {
    get db() {
      return testDb;
    },
  };
});

// Mock AIService to avoid real API calls
vi.mock('../services/ai.service.js', () => {
  return {
    AIService: vi.fn().mockImplementation(() => ({
      testConnection: vi.fn().mockResolvedValue(true),
    })),
  };
});

// Import router after mock setup
const { default: configRouter } = await import('./config.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRouter);
  return app;
}

function initTestDb() {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  testDb = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

describe('Config Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    initTestDb();
    app = createApp();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('GET /api/config/api-key-status', () => {
    it('should return configured: false when no key exists', async () => {
      const res = await request(app).get('/api/config/api-key-status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { configured: false } });
    });

    it('should return configured: true when key exists', async () => {
      const encoded = Buffer.from('sk-test-key').toString('base64');
      sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', '${encoded}')`);

      const res = await request(app).get('/api/config/api-key-status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { configured: true } });
    });

    it('should return configured: false when key value is empty', async () => {
      sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', '')`);

      const res = await request(app).get('/api/config/api-key-status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { configured: false } });
    });
  });

  describe('POST /api/config/api-key', () => {
    it('should save a new API key', async () => {
      const res = await request(app)
        .post('/api/config/api-key')
        .send({ apiKey: 'sk-my-test-key' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { configured: true } });

      // Verify stored as base64
      const rows = testDb.select().from(config).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe('deepseek_api_key');
      const decoded = Buffer.from(rows[0].value, 'base64').toString('utf-8');
      expect(decoded).toBe('sk-my-test-key');
    });

    it('should update an existing API key', async () => {
      const oldEncoded = Buffer.from('old-key').toString('base64');
      sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', '${oldEncoded}')`);

      const res = await request(app)
        .post('/api/config/api-key')
        .send({ apiKey: 'new-key' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { configured: true } });

      // Verify updated
      const rows = testDb.select().from(config).all();
      expect(rows).toHaveLength(1);
      const decoded = Buffer.from(rows[0].value, 'base64').toString('utf-8');
      expect(decoded).toBe('new-key');
    });

    it('should reject empty apiKey', async () => {
      const res = await request(app)
        .post('/api/config/api-key')
        .send({ apiKey: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should reject missing apiKey', async () => {
      const res = await request(app)
        .post('/api/config/api-key')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should trim whitespace from apiKey', async () => {
      const res = await request(app)
        .post('/api/config/api-key')
        .send({ apiKey: '  sk-trimmed  ' });

      expect(res.status).toBe(200);

      const rows = testDb.select().from(config).all();
      const decoded = Buffer.from(rows[0].value, 'base64').toString('utf-8');
      expect(decoded).toBe('sk-trimmed');
    });
  });

  describe('POST /api/config/api-key/test', () => {
    it('should return error when no key is configured', async () => {
      const res = await request(app)
        .post('/api/config/api-key/test')
        .send();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_CONFIGURED');
    });

    it('should test connection with stored key', async () => {
      const encoded = Buffer.from('sk-valid-key').toString('base64');
      sqlite.exec(`INSERT INTO config (key, value) VALUES ('deepseek_api_key', '${encoded}')`);

      const res = await request(app)
        .post('/api/config/api-key/test')
        .send();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { connected: true } });
    });
  });
});

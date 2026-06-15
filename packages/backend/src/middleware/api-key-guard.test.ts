import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock the db module
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('../db/schema.js', () => ({
  config: { key: 'key' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { db } from '../db/index.js';
import { apiKeyGuard } from './api-key-guard.js';

describe('apiKeyGuard', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = {};
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    res = { status: statusMock } as Partial<Response>;
    next = vi.fn();
  });

  it('should return 403 with API_KEY_NOT_CONFIGURED when no key exists in config', () => {
    const getMock = vi.fn().mockReturnValue(undefined);
    const whereMock = vi.fn().mockReturnValue({ get: getMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock });

    apiKeyGuard(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'API_KEY_NOT_CONFIGURED',
        message: '请先在设置中配置 DeepSeek API 密钥',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when key exists but value is empty', () => {
    const getMock = vi.fn().mockReturnValue({ key: 'deepseek_api_key', value: '' });
    const whereMock = vi.fn().mockReturnValue({ get: getMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock });

    apiKeyGuard(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'API_KEY_NOT_CONFIGURED',
        message: '请先在设置中配置 DeepSeek API 密钥',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when API key is configured', () => {
    const getMock = vi.fn().mockReturnValue({ key: 'deepseek_api_key', value: 'sk-test-key-123' });
    const whereMock = vi.fn().mockReturnValue({ get: getMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromMock });

    apiKeyGuard(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import { validateUploadFile, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from './upload.service';

describe('validateUploadFile', () => {
  it('should accept a valid PDF file', () => {
    const result = validateUploadFile({ mimetype: 'application/pdf', size: 1024 });
    expect(result).toEqual({ valid: true });
  });

  it('should accept a valid DOCX file', () => {
    const result = validateUploadFile({
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
    });
    expect(result).toEqual({ valid: true });
  });

  it('should accept a file exactly at the size limit', () => {
    const result = validateUploadFile({ mimetype: 'application/pdf', size: MAX_FILE_SIZE });
    expect(result).toEqual({ valid: true });
  });

  it('should reject an unsupported MIME type', () => {
    const result = validateUploadFile({ mimetype: 'image/png', size: 1024 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('仅支持 PDF 和 Word 格式');
  });

  it('should reject a file exceeding the size limit', () => {
    const result = validateUploadFile({ mimetype: 'application/pdf', size: MAX_FILE_SIZE + 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('文件大小超过上限');
  });

  it('should reject invalid MIME type before checking size', () => {
    const result = validateUploadFile({ mimetype: 'text/plain', size: MAX_FILE_SIZE + 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('仅支持 PDF 和 Word 格式');
  });

  it('should reject zero-byte files with invalid type', () => {
    const result = validateUploadFile({ mimetype: 'application/zip', size: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('仅支持 PDF 和 Word 格式');
  });

  it('exports ALLOWED_MIME_TYPES with correct values', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(ALLOWED_MIME_TYPES).toHaveLength(2);
  });

  it('exports MAX_FILE_SIZE as 200MB', () => {
    expect(MAX_FILE_SIZE).toBe(200 * 1024 * 1024);
  });
});

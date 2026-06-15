import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentProcessor } from './document.processor.js';

describe('DocumentProcessor', () => {
  let processor: DocumentProcessor;

  beforeEach(() => {
    processor = new DocumentProcessor();
  });

  describe('extractText - 不支持的文件类型', () => {
    it('应该对不支持的文件类型抛出异常', async () => {
      await expect(
        processor.extractText('/some/file.txt', 'txt')
      ).rejects.toThrow('不支持的文件类型: txt，仅支持 pdf 和 docx');
    });

    it('应该对空字符串文件类型抛出异常', async () => {
      await expect(
        processor.extractText('/some/file', '')
      ).rejects.toThrow('不支持的文件类型: ，仅支持 pdf 和 docx');
    });
  });

  describe('extractText - 文件不存在', () => {
    it('PDF 文件不存在时应该抛出明确异常', async () => {
      await expect(
        processor.extractText('/nonexistent/path/file.pdf', 'pdf')
      ).rejects.toThrow('文件不存在: /nonexistent/path/file.pdf');
    });

    it('Word 文件不存在时应该抛出明确异常', async () => {
      await expect(
        processor.extractText('/nonexistent/path/file.docx', 'docx')
      ).rejects.toThrow('文件不存在: /nonexistent/path/file.docx');
    });
  });

  describe('extractText - PDF 抽取失败', () => {
    it('PDF 解析失败时应返回空文本（多策略均失败）', async () => {
      // 创建一个无效的 PDF 文件
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpDir = os.default.tmpdir();
      const invalidPdfPath = path.default.join(tmpDir, 'invalid-test.pdf');
      await fs.writeFile(invalidPdfPath, 'this is not a valid pdf content');

      try {
        const result = await processor.extractText(invalidPdfPath, 'pdf');
        // Multi-strategy approach returns empty string when all fail
        expect(result).toBe('');
      } finally {
        await fs.unlink(invalidPdfPath).catch(() => {});
      }
    }, 30000); // Increased timeout for OCR attempt
  });

  describe('extractText - Word 抽取失败', () => {
    it('Word 解析失败时应该包装错误并包含文件路径', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpDir = os.default.tmpdir();
      const invalidDocxPath = path.default.join(tmpDir, 'invalid-test.docx');
      await fs.writeFile(invalidDocxPath, 'this is not a valid docx content');

      try {
        await expect(
          processor.extractText(invalidDocxPath, 'docx')
        ).rejects.toThrow(/Word 文本抽取失败/);
      } finally {
        await fs.unlink(invalidDocxPath).catch(() => {});
      }
    });
  });
});

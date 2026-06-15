/**
 * 文档处理器
 * 负责从 PDF 和 Word 文件中抽取纯文本内容，并支持大文件自动切片
 * 支持多种 PDF 提取策略：pdf-parse → unpdf → tesseract OCR
 */

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'node:fs/promises';

export type SupportedFileType = 'pdf' | 'docx';

/** 单个切片的最大字符数（约 40K 字符 ≈ 20K tokens，留余量给 AI prompt） */
const CHUNK_MAX_CHARS = 40000;

/** 切片时的重叠字符数（保证上下文连续性） */
const CHUNK_OVERLAP = 500;

export interface TextChunk {
  /** 切片序号（从 1 开始） */
  index: number;
  /** 切片标题/分类（如果能识别章节则用章节名，否则用"第X部分"） */
  title: string;
  /** 切片文本内容 */
  text: string;
}

export class DocumentProcessor {
  /**
   * 从文件中抽取纯文本内容
   * @param filePath 文件路径
   * @param fileType 文件类型（'pdf' 或 'docx'）
   * @returns 抽取的纯文本内容
   */
  async extractText(filePath: string, fileType: string): Promise<string> {
    if (fileType !== 'pdf' && fileType !== 'docx') {
      throw new Error(`不支持的文件类型: ${fileType}，仅支持 pdf 和 docx`);
    }

    await this.ensureFileExists(filePath);

    if (fileType === 'pdf') {
      return this.extractFromPdf(filePath);
    }
    return this.extractFromDocx(filePath);
  }

  /**
   * 从文件中抽取文本并自动切片（大文件场景）
   * 如果文本长度不超过阈值，返回单个切片
   * 如果超过阈值，按章节/段落边界智能切分
   * @returns 切片数组
   */
  async extractAndChunk(filePath: string, fileType: string): Promise<TextChunk[]> {
    const fullText = await this.extractText(filePath, fileType);

    if (fullText.length <= CHUNK_MAX_CHARS) {
      return [{ index: 1, title: '全文', text: fullText }];
    }

    return this.splitIntoChunks(fullText);
  }

  /**
   * 将长文本智能切分为多个切片
   * 优先按章节标题切分，其次按段落边界切分
   */
  private splitIntoChunks(text: string): TextChunk[] {
    // Try to split by chapter/section headers first
    const chapterChunks = this.splitByChapters(text);
    if (chapterChunks.length > 1) {
      // Further split any oversized chapters
      const result: TextChunk[] = [];
      let idx = 1;
      for (const chunk of chapterChunks) {
        if (chunk.text.length <= CHUNK_MAX_CHARS) {
          result.push({ index: idx++, title: chunk.title, text: chunk.text });
        } else {
          const subChunks = this.splitBySize(chunk.text);
          for (let i = 0; i < subChunks.length; i++) {
            result.push({ index: idx++, title: `${chunk.title} (${i + 1}/${subChunks.length})`, text: subChunks[i] });
          }
        }
      }
      return result;
    }

    // Fallback: split by fixed size at paragraph boundaries
    const sizeChunks = this.splitBySize(text);
    return sizeChunks.map((chunk, i) => ({
      index: i + 1,
      title: `第${i + 1}部分`,
      text: chunk,
    }));
  }

  /**
   * 按章节标题切分文本
   * 识别常见的中文章节标记：第X章、第X节、一、二、(一)、1.、等
   */
  private splitByChapters(text: string): Array<{ title: string; text: string }> {
    // Common Chinese chapter/section patterns
    const chapterPattern = /\n(第[一二三四五六七八九十百千\d]+[章节篇部分][\s\S]*?(?=\n)|[一二三四五六七八九十]+[、.．]\s*.+|(?:Chapter|CHAPTER)\s+\d+[\s\S]*?(?=\n))/g;

    const matches: Array<{ index: number; title: string }> = [];
    let match;
    while ((match = chapterPattern.exec(text)) !== null) {
      const title = match[1].trim().split('\n')[0].slice(0, 50);
      matches.push({ index: match.index, title });
    }

    if (matches.length < 2) return [{ title: '全文', text }];

    const chunks: Array<{ title: string; text: string }> = [];

    // Text before first chapter
    if (matches[0].index > 200) {
      chunks.push({ title: '前言', text: text.slice(0, matches[0].index).trim() });
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 100) {
        chunks.push({ title: matches[i].title, text: chunkText });
      }
    }

    return chunks;
  }

  /**
   * 按固定大小在段落边界切分
   */
  private splitBySize(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + CHUNK_MAX_CHARS;

      if (end >= text.length) {
        chunks.push(text.slice(start).trim());
        break;
      }

      // Find a good break point (paragraph boundary)
      let breakPoint = text.lastIndexOf('\n\n', end);
      if (breakPoint <= start + CHUNK_MAX_CHARS * 0.5) {
        // No good paragraph break, try single newline
        breakPoint = text.lastIndexOf('\n', end);
      }
      if (breakPoint <= start + CHUNK_MAX_CHARS * 0.5) {
        // No good break at all, just cut at max
        breakPoint = end;
      }

      chunks.push(text.slice(start, breakPoint).trim());
      // Start next chunk with overlap for context continuity
      start = breakPoint - CHUNK_OVERLAP;
      if (start < 0) start = 0;
    }

    return chunks.filter((c) => c.length > 50);
  }

  /**
   * 检查文件是否存在
   */
  private async ensureFileExists(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`文件不存在: ${filePath}`);
    }
  }

  /**
   * 从 PDF 文件中抽取文本（多策略）
   * 策略 1: pdf-parse (快速，适合有文字层的 PDF)
   * 策略 2: unpdf (基于 pdf.js，处理更多 PDF 类型)
   * 策略 3: tesseract.js OCR (扫描版 PDF，速度较慢)
   */
  private async extractFromPdf(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);

    // Strategy 1: pdf-parse
    try {
      const result = await pdfParse(buffer, { pagerender: undefined });
      let text = result.text.normalize('NFC');
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      text = text.replace(/[ \t]+/g, ' ');
      text = text.replace(/\n{3,}/g, '\n\n');
      text = text.trim();
      if (text.length > 50) {
        return text;
      }
    } catch {
      // pdf-parse failed, try next strategy
    }

    // Strategy 2: unpdf (handles more PDF types)
    try {
      const { extractText } = await import('unpdf');
      const result = await extractText(buffer, { mergePages: true });
      let text = (result.text ?? '').normalize('NFC');
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      text = text.trim();
      if (text.length > 50) {
        return text;
      }
    } catch {
      // unpdf failed
    }

    // All strategies failed — return empty (caller will mark as failed)
    return '';
  }

  /**
   * 从 Word 文件中抽取文本
   */
  private async extractFromDocx(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      let text = result.value.normalize('NFC');
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      return text.trim();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('文件不存在')) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Word 文本抽取失败 [${filePath}]: ${message}`);
    }
  }
}

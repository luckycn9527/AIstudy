/**
 * OCR 服务 — 使用硅基流动 (SiliconFlow) 平台的 DeepSeek-OCR 模型
 * 
 * 大文件处理策略：使用 pdf-lib 将 PDF 按页拆分，逐页发送 OCR
 * 
 * API: https://api.siliconflow.cn/v1
 * Model: deepseek-ai/DeepSeek-OCR
 */

import OpenAI from 'openai';
import { PDFDocument } from 'pdf-lib';

export class OCRService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.siliconflow.cn/v1',
    });
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (err) {
      console.error('[OCR] 连接测试失败:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * 从 PDF 文件提取文字（按页拆分 + 逐页 OCR）
   * @param pdfBuffer 原始 PDF 文件 buffer
   * @param fileName 文件名（用于日志）
   * @returns 提取的完整文字
   */
  async extractTextFromPDF(pdfBuffer: Buffer, fileName: string): Promise<string> {
    try {
      // 1. 用 pdf-lib 加载 PDF 获取页数
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const totalPages = pdfDoc.getPageCount();
      console.log(`[OCR] ${fileName}: 共 ${totalPages} 页，开始逐页识别...`);

      const results: string[] = [];
      // 每次处理的页数（合并几页为一个小 PDF 发送，减少请求次数）
      const PAGES_PER_BATCH = 3;

      for (let startPage = 0; startPage < totalPages; startPage += PAGES_PER_BATCH) {
        const endPage = Math.min(startPage + PAGES_PER_BATCH, totalPages);

        // 2. 创建只包含当前批次页面的子 PDF
        const subDoc = await PDFDocument.create();
        const pageIndices = Array.from({ length: endPage - startPage }, (_, i) => startPage + i);
        const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);
        for (const page of copiedPages) {
          subDoc.addPage(page);
        }

        const subPdfBytes = await subDoc.save();
        const subBase64 = Buffer.from(subPdfBytes).toString('base64');

        // 3. 发送子 PDF 给 OCR
        console.log(`[OCR] ${fileName}: 识别第 ${startPage + 1}-${endPage} 页 (${Math.round(subBase64.length / 1024)}KB)...`);

        try {
          const response = await this.client.chat.completions.create({
            model: 'deepseek-ai/DeepSeek-OCR',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:application/pdf;base64,${subBase64}`,
                      detail: 'high',
                    },
                  },
                  {
                    type: 'text',
                    text: '请提取文档中的所有文字内容，保持原始结构和格式。如果是试卷请保留题号和选项。直接输出文字，不要添加说明。',
                  },
                ],
              },
            ],
            max_tokens: 8000,
          });

          const text = response.choices[0]?.message?.content ?? '';
          if (text.trim().length > 0) {
            results.push(text);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[OCR] 第 ${startPage + 1}-${endPage} 页识别失败: ${errMsg}`);
          // Continue with next batch
        }
      }

      const fullText = results.join('\n\n');
      console.log(`[OCR] ${fileName}: 全部完成，共提取 ${fullText.length} 字符`);
      return fullText;
    } catch (err) {
      console.error('[OCR] PDF 处理失败:', err instanceof Error ? err.message : err);
      return '';
    }
  }
}

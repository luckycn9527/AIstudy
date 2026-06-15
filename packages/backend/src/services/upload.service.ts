/**
 * 文件上传验证服务
 * 校验上传文件的 MIME 类型和文件大小
 */

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

export function validateUploadFile(file: { mimetype: string; size: number }): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: '仅支持 PDF 和 Word 格式' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小超过上限（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` };
  }
  return { valid: true };
}

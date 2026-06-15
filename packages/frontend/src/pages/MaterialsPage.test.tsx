import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsPage } from './MaterialsPage';

// Mock the SubjectContext
const mockUseSubject = vi.fn();
vi.mock('../contexts/SubjectContext', () => ({
  useSubject: () => mockUseSubject(),
}));

// Mock the api module
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock('../services/api', () => ({
  api: {
    get: (...args: any[]) => mockApi.get(...args),
    post: (...args: any[]) => mockApi.post(...args),
  },
}));

describe('MaterialsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message to select subject when no subject is selected', () => {
    mockUseSubject.mockReturnValue({ currentSubject: null });
    render(<MaterialsPage />);
    expect(screen.getByText('请先在左侧选择一个学科')).toBeInTheDocument();
  });

  it('renders upload section when subject is selected', () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } });

    render(<MaterialsPage />);
    expect(screen.getByText('选择文件上传')).toBeInTheDocument();
    expect(screen.getByText('支持 PDF、Word 格式，最大 200MB（大文件自动切片分类）')).toBeInTheDocument();
  });

  it('shows validation error for invalid file type', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } });

    render(<MaterialsPage />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('仅支持 PDF 和 Word 格式')).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows validation error for oversized file', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } });

    render(<MaterialsPage />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Create a file object with size > 200MB
    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 201 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('文件大小超过上限（最大 200MB）')).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('renders materials list with status badges', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'm1',
            fileName: 'chapter1.pdf',
            fileType: 'pdf',
            fileSize: 1024000,
            status: 'ready',
            uploadedAt: '2024-06-01T10:00:00Z',
          },
          {
            id: 'm2',
            fileName: 'notes.docx',
            fileType: 'docx',
            fileSize: 512000,
            status: 'processing',
            uploadedAt: '2024-06-02T14:30:00Z',
          },
          {
            id: 'm3',
            fileName: 'broken.pdf',
            fileType: 'pdf',
            fileSize: 2048000,
            status: 'failed',
            uploadedAt: '2024-06-03T09:00:00Z',
            errorMessage: '文件损坏',
          },
        ],
      },
    });

    render(<MaterialsPage />);

    await waitFor(() => {
      expect(screen.getByText('chapter1.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText('已就绪')).toBeInTheDocument();
    expect(screen.getByText('处理中')).toBeInTheDocument();
    expect(screen.getByText('处理失败')).toBeInTheDocument();
    expect(screen.getByText('错误: 文件损坏')).toBeInTheDocument();
  });

  it('shows AI analysis button only for ready materials', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'm1',
            fileName: 'chapter1.pdf',
            fileType: 'pdf',
            fileSize: 1024000,
            status: 'ready',
            uploadedAt: '2024-06-01T10:00:00Z',
          },
          {
            id: 'm2',
            fileName: 'notes.docx',
            fileType: 'docx',
            fileSize: 512000,
            status: 'processing',
            uploadedAt: '2024-06-02T14:30:00Z',
          },
        ],
      },
    });

    render(<MaterialsPage />);

    await waitFor(() => {
      expect(screen.getByText('chapter1.pdf')).toBeInTheDocument();
    });

    const analyzeButtons = screen.getAllByText('AI 分析');
    expect(analyzeButtons).toHaveLength(1);
  });

  it('triggers AI analysis and shows knowledge points', async () => {
    mockUseSubject.mockReturnValue({
      currentSubject: { id: 'sub1', name: '数学', createdAt: '2024-01-01' },
    });
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/materials') && !url.includes('/knowledge-points')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'm1',
                fileName: 'chapter1.pdf',
                fileType: 'pdf',
                fileSize: 1024000,
                status: 'ready',
                uploadedAt: '2024-06-01T10:00:00Z',
              },
            ],
          },
        });
      }
      if (url.includes('/knowledge-points')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              { id: 'kp1', title: '微积分基础', description: '导数与积分的基本概念' },
              { id: 'kp2', title: '极限理论', description: '函数极限的定义与性质' },
            ],
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    mockApi.post.mockResolvedValue({ data: { success: true } });

    render(<MaterialsPage />);

    await waitFor(() => {
      expect(screen.getByText('AI 分析')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('AI 分析'));

    await waitFor(() => {
      expect(screen.getByText('微积分基础')).toBeInTheDocument();
      expect(screen.getByText('极限理论')).toBeInTheDocument();
    });
  });
});

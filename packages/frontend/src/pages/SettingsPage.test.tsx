import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from './SettingsPage';

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

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockApi.get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SettingsPage />);
    expect(screen.getByRole('status', { name: '加载中' })).toBeInTheDocument();
  });

  it('shows warning banner when API key is not configured', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: false } } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('API 密钥未配置')).toBeInTheDocument();
    });
    expect(screen.getByText(/请先配置 DeepSeek API 密钥/)).toBeInTheDocument();
  });

  it('shows configured status when API key is set', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: true } } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('已配置')[0]).toBeInTheDocument();
    });
    // Warning banner should not be present
    expect(screen.queryByText('API 密钥未配置')).not.toBeInTheDocument();
  });

  it('saves API key successfully', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: false } } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: { configured: true } } });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('未配置')[0]).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('输入 DeepSeek API 密钥');
    fireEvent.change(input, { target: { value: 'sk-test-key-123' } });
    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => {
      expect(screen.getByText('API 密钥保存成功')).toBeInTheDocument();
    });
    expect(mockApi.post).toHaveBeenCalledWith('/config/api-key', { apiKey: 'sk-test-key-123' });
  });

  it('shows error when save fails', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: false } } });
    mockApi.post.mockRejectedValue({
      response: { data: { success: false, error: { message: '保存失败，请重试' } } },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入 DeepSeek API 密钥')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('输入 DeepSeek API 密钥');
    fireEvent.change(input, { target: { value: 'bad-key' } });
    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => {
      expect(screen.getByText('保存失败，请重试')).toBeInTheDocument();
    });
  });

  it('tests connection successfully', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: true } } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: { connected: true } } });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('测试连接')[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('测试连接')[0]);

    await waitFor(() => {
      expect(screen.getByText('连接成功！DeepSeek API 可正常使用')).toBeInTheDocument();
    });
  });

  it('shows failure when connection test fails', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: true } } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: { connected: false } } });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('测试连接')[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('测试连接')[0]);

    await waitFor(() => {
      expect(screen.getByText('连接失败，请检查 API 密钥是否正确')).toBeInTheDocument();
    });
  });

  it('disables test button when key is not configured', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: false } } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('测试连接')[0]).toBeInTheDocument();
    });

    const testButton = screen.getAllByText('测试连接')[0];
    expect(testButton).toBeDisabled();
  });

  it('toggles password visibility', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { configured: false } } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入 DeepSeek API 密钥')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('输入 DeepSeek API 密钥') as HTMLInputElement;
    expect(input.type).toBe('password');

    // Click show button
    const toggleButton = screen.getByTitle('显示密钥');
    fireEvent.click(toggleButton);
    expect(input.type).toBe('text');

    // Click hide button
    const hideButton = screen.getByTitle('隐藏密钥');
    fireEvent.click(hideButton);
    expect(input.type).toBe('password');
  });
});

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { Card, Badge, Button, SkeletonList } from '../components/ui';
import { api } from '../services/api';

export function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkApiKeyStatus();
  }, []);

  const checkApiKeyStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: true; data: { configured: boolean } }>('/config/api-key-status');
      setConfigured(res.data.data.configured);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setSaveMessage({ type: 'error', text: 'API 密钥不能为空' });
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setTestResult(null);

    try {
      await api.post('/config/api-key', { apiKey: apiKey.trim() });
      setSaveMessage({ type: 'success', text: 'API 密钥保存成功' });
      setConfigured(true);
      setApiKey('');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || '保存失败，请重试';
      setSaveMessage({ type: 'error', text: message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.post<{ success: true; data: { connected: boolean } }>('/config/api-key/test');
      if (res.data.data.connected) {
        setTestResult({ type: 'success', text: '连接成功！DeepSeek API 可正常使用' });
      } else {
        setTestResult({ type: 'error', text: '连接失败，请检查 API 密钥是否正确' });
      }
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || '测试连接失败，请检查网络或 API 密钥';
      setTestResult({ type: 'error', text: message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '0' }}>
        <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>系统设置</h2>
        <SkeletonList rows={3} rowHeight={80} />
      </div>
    );
  }

  return (
    <div style={{ padding: '0', maxWidth: '700px' }}>
      <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>系统设置</h2>

      {/* Warning banner when API key is not configured */}
      {!configured && (
        <div
          style={{
            marginBottom: '24px',
            padding: '14px 18px',
            backgroundColor: '#FFFBEB',
            color: '#92400E',
            border: '1px solid #FDE68A',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <span>
            <strong>API 密钥未配置</strong> — 请先配置 DeepSeek API 密钥，否则 AI 相关功能（分析、出题、评分）将无法使用。
          </span>
        </div>
      )}

      {/* DeepSeek API Configuration Section */}
      <Card>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 600 }}>DeepSeek API 配置</h3>

        {/* Status indicator */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', color: '#6B7280' }}>当前状态：</span>
          {configured ? (
            <Badge variant="success"><CheckCircle2 size={13} /> 已配置</Badge>
          ) : (
            <Badge variant="danger"><XCircle size={13} /> 未配置</Badge>
          )}
        </div>

        {/* API Key Input */}
        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="api-key-input"
            style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#1F2937' }}
          >
            API 密钥
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 DeepSeek API 密钥"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 14px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#9CA3AF',
                  padding: '2px 4px',
                }}
                title={showKey ? '隐藏密钥' : '显示密钥'}
                aria-label={showKey ? '隐藏密钥' : '显示密钥'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <Button onClick={handleSave} disabled={saving || !apiKey.trim()} loading={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button variant="success" onClick={handleTest} disabled={testing || !configured} loading={testing}>
            {testing ? '测试中...' : '测试连接'}
          </Button>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: saveMessage.type === 'success' ? '#D1FAE5' : '#FEE2E2',
              color: saveMessage.type === 'success' ? '#065F46' : '#991B1B',
              border: `1px solid ${saveMessage.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
            }}
          >
            {saveMessage.text}
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: testResult.type === 'success' ? '#D1FAE5' : '#FEE2E2',
              color: testResult.type === 'success' ? '#065F46' : '#991B1B',
              border: `1px solid ${testResult.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
            }}
          >
            {testResult.text}
          </div>
        )}

        {/* Help text */}
        <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '12px' }}>
          <p style={{ margin: '0 0 4px 0' }}>
            请前往 <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6248F1' }}>DeepSeek 开放平台</a> 获取 API 密钥。
          </p>
          <p style={{ margin: 0 }}>
            密钥将加密存储在本地，不会上传到任何外部服务器。
          </p>
        </div>
      </Card>

      {/* SiliconFlow OCR Configuration */}
      <Card style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>OCR 识别配置（扫描版 PDF）</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#9CA3AF' }}>
          用于识别扫描版 PDF 中的文字。使用硅基流动 (SiliconFlow) 平台的 DeepSeek-OCR 模型。
        </p>

        <OCRKeySection />
      </Card>
    </div>
  );
}

function OCRKeySection() {
  const [ocrKey, setOcrKey] = useState('');
  const [ocrConfigured, setOcrConfigured] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(true);
  const [ocrSaving, setOcrSaving] = useState(false);
  const [ocrTesting, setOcrTesting] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get<{ success: true; data: { configured: boolean } }>('/config/ocr-key-status')
      .then((res) => setOcrConfigured(res.data.data.configured))
      .catch(() => setOcrConfigured(false))
      .finally(() => setOcrLoading(false));
  }, []);

  const handleSave = async () => {
    if (!ocrKey.trim()) { setOcrMessage({ type: 'error', text: 'API 密钥不能为空' }); return; }
    setOcrSaving(true);
    setOcrMessage(null);
    try {
      await api.post('/config/ocr-key', { apiKey: ocrKey.trim() });
      setOcrMessage({ type: 'success', text: 'OCR 密钥保存成功' });
      setOcrConfigured(true);
      setOcrKey('');
    } catch {
      setOcrMessage({ type: 'error', text: '保存失败' });
    } finally { setOcrSaving(false); }
  };

  const handleTest = async () => {
    setOcrTesting(true);
    setOcrMessage(null);
    try {
      const res = await api.post<{ success: true; data: { connected: boolean } }>('/config/ocr-key/test');
      setOcrMessage(res.data.data.connected
        ? { type: 'success', text: '连接成功！SiliconFlow OCR 可正常使用' }
        : { type: 'error', text: '连接失败，请检查密钥' });
    } catch {
      setOcrMessage({ type: 'error', text: '测试失败' });
    } finally { setOcrTesting(false); }
  };

  if (ocrLoading) return <SkeletonList rows={2} rowHeight={50} />;

  return (
    <>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '14px', color: '#6B7280' }}>状态：</span>
        <Badge variant={ocrConfigured ? 'success' : 'danger'}>
          {ocrConfigured ? '已配置' : '未配置'}
        </Badge>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>SiliconFlow API Key</label>
        <input
          type="password"
          value={ocrKey}
          onChange={(e) => setOcrKey(e.target.value)}
          placeholder="输入 SiliconFlow API 密钥"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <Button onClick={handleSave} disabled={ocrSaving || !ocrKey.trim()} loading={ocrSaving}>
          {ocrSaving ? '保存中...' : '保存'}
        </Button>
        <Button variant="success" onClick={handleTest} disabled={ocrTesting || !ocrConfigured} loading={ocrTesting}>
          {ocrTesting ? '测试中...' : '测试连接'}
        </Button>
      </div>

      {ocrMessage && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: ocrMessage.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: ocrMessage.type === 'success' ? '#065F46' : '#991B1B' }}>
          {ocrMessage.text}
        </div>
      )}

      <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '12px' }}>
        <p style={{ margin: 0 }}>
          前往 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener noreferrer" style={{ color: '#6248F1' }}>硅基流动平台</a> 获取 API Key。模型：deepseek-ai/DeepSeek-OCR
        </p>
      </div>
    </>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, UploadCloud, Brain, Trash2, Lightbulb } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { Card, Badge, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

interface Material {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  uploadedAt: string;
  errorMessage?: string;
}

interface KnowledgePoint {
  id: string;
  title: string;
  description?: string;
}

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return '仅支持 PDF 和 Word 格式';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `文件大小超过上限（最大 200MB）`;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: Material['status']) {
  const config: Record<Material['status'], { variant: 'warning' | 'success' | 'danger'; label: string }> = {
    uploading: { variant: 'warning', label: '上传中' },
    processing: { variant: 'warning', label: '处理中' },
    ready: { variant: 'success', label: '已就绪' },
    failed: { variant: 'danger', label: '处理失败' },
  };
  const s = config[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function MaterialsPage() {
  const { currentSubject } = useSubject();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<Record<string, KnowledgePoint[]>>({});
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMaterials = useCallback(async () => {
    if (!currentSubject) return;
    setLoading(true);
    try {
      const res = await api.get<{ success: true; data: Material[] }>(
        `/subjects/${currentSubject.id}/materials`
      );
      setMaterials(res.data.data);
    } catch {
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [currentSubject]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentSubject) return;

    // Reset input so same file can be selected again
    e.target.value = '';

    // Frontend validation
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/subjects/${currentSubject.id}/materials/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await fetchMaterials();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || '上传失败，请重试';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (materialId: string) => {
    setAnalyzingId(materialId);
    setAnalyzeError(null);
    try {
      await api.post(`/materials/${materialId}/analyze`);
      // Fetch knowledge points after analysis
      await fetchKnowledgePoints(materialId);
      setExpandedMaterial(materialId);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || 'AI 分析失败，请检查网络连接或 API 配置';
      setAnalyzeError(message);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDelete = async (materialId: string, fileName: string) => {
    if (!confirm(`确定要删除「${fileName}」吗？关联的知识点也将被删除。`)) return;
    setDeletingId(materialId);
    try {
      await api.delete(`/materials/${materialId}`);
      await fetchMaterials();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || '删除失败，请重试';
      setAnalyzeError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const fetchKnowledgePoints = async (materialId: string) => {
    try {
      const res = await api.get<{ success: true; data: KnowledgePoint[] }>(
        `/materials/${materialId}/knowledge-points`
      );
      setKnowledgePoints((prev) => ({ ...prev, [materialId]: res.data.data }));
    } catch {
      // Silently fail - knowledge points just won't show
    }
  };

  const toggleKnowledgePoints = async (materialId: string) => {
    if (expandedMaterial === materialId) {
      setExpandedMaterial(null);
      return;
    }
    if (!knowledgePoints[materialId]) {
      await fetchKnowledgePoints(materialId);
    }
    setExpandedMaterial(materialId);
  };

  if (!currentSubject) {
    return (
      <EmptyState
        icon={<FolderOpen size={48} />}
        title="请先在左侧选择一个学科"
        description="选择学科后即可上传和管理该学科的资料"
        minHeight={400}
      />
    );
  }

  return (
    <div style={{ padding: '0', maxWidth: '1000px' }}>
      <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>资料管理</h2>

      {/* Upload Section */}
      <div
        style={{
          marginBottom: '24px',
          padding: '32px',
          border: '2px dashed #D1D5DB',
          borderRadius: '14px',
          backgroundColor: '#fff',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center', color: '#9CA3AF' }}>
          <UploadCloud size={40} />
        </div>
        <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '16px' }}>
          拖拽文件到此处，或点击按钮上传
        </p>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} loading={uploading}>
          {uploading ? '上传中...' : '选择文件上传'}
        </Button>
        <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '12px', marginBottom: 0 }}>
          支持 PDF、Word 格式，最大 200MB（大文件自动切片分类）
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {uploadError && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              backgroundColor: '#FEE2E2',
              color: '#991B1B',
              borderRadius: '8px',
              fontSize: '13px',
              border: '1px solid #FECACA',
              display: 'inline-block',
            }}
          >
            {uploadError}
          </div>
        )}
      </div>

      {/* Analysis Error */}
      {analyzeError && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: '#FEE2E2',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '13px',
            border: '1px solid #FECACA',
          }}
        >
          {analyzeError}
        </div>
      )}

      {/* Materials List */}
      {loading ? (
        <SkeletonList rows={3} />
      ) : materials.length === 0 ? (
        <Card style={{ padding: 0 }}>
          <EmptyState
            icon={<FolderOpen size={48} />}
            title="暂无资料"
            description="请上传 PDF 或 Word 文件开始"
            minHeight={200}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {materials.map((material) => (
            <Card key={material.id} style={{ padding: '20px 24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#1F2937' }}>
                      {material.fileName}
                    </span>
                    {getStatusBadge(material.status)}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#9CA3AF' }}>
                    {formatTime(material.uploadedAt)} · {formatFileSize(material.fileSize)}
                  </div>
                  {material.status === 'failed' && material.errorMessage && (
                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#991B1B' }}>
                      错误: {material.errorMessage}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {material.status === 'ready' && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleAnalyze(material.id)}
                      disabled={analyzingId === material.id}
                      loading={analyzingId === material.id}
                    >
                      <Brain size={14} />
                      {analyzingId === material.id ? '分析中...' : 'AI 分析'}
                    </Button>
                  )}
                  {knowledgePoints[material.id]?.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => toggleKnowledgePoints(material.id)}>
                      {expandedMaterial === material.id ? '收起知识点' : '查看知识点'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(material.id, material.fileName)}
                    disabled={deletingId === material.id}
                    loading={deletingId === material.id}
                    style={{ color: '#EF4444', border: '1px solid #FECACA' }}
                  >
                    <Trash2 size={14} />
                    {deletingId === material.id ? '删除中...' : '删除'}
                  </Button>
                </div>
              </div>

              {/* Knowledge Points Expandable Section */}
              {expandedMaterial === material.id && knowledgePoints[material.id] && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: '#F0FDF4',
                    borderRadius: '10px',
                    border: '1px solid #BBF7D0',
                  }}
                >
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Lightbulb size={15} />
                    知识点摘要（{knowledgePoints[material.id].length} 个）
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {knowledgePoints[material.id].map((kp) => (
                      <li key={kp.id} style={{ marginBottom: '6px', fontSize: '13px', color: '#1F2937' }}>
                        <strong>{kp.title}</strong>
                        {kp.description && (
                          <span style={{ color: '#6B7280' }}> - {kp.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

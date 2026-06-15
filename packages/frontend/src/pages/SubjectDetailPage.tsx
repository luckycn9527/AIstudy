import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Trash2, Sparkles, PenLine, FolderOpen } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { useDashboard } from '../contexts/DashboardContext';
import { useToast } from '../components/ui/ToastProvider';
import { Card, Badge, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

interface Material {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  materialType?: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  uploadedAt: string;
  errorMessage?: string;
}

interface Question {
  id: string;
  type: string;
  stem: string;
  options: string[] | null;
  correctAnswer: string;
  materialId: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
};

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  exam_paper: '真题',
  textbook: '教材',
  notes: '笔记',
  slides: 'PPT',
  formula_sheet: '公式',
  wrong_questions: '错题',
  summary: '总结',
  reference: '参考',
  cheat_sheet: '速记',
  answer_sheet: '答案',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { subjects, setCurrentSubject } = useSubject();
  const { data: dashboard, refresh: refreshDashboard } = useDashboard();
  const toast = useToast();

  const subject = subjects.find((s) => s.id === subjectId);
  const stats = dashboard?.subjects?.find((s) => s.id === subjectId);

  // Materials state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadType, setUploadType] = useState<string>('exam_paper');

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ id: string; name: string; questionCount: number } | null>(null);
  const [deleteWithQuestions, setDeleteWithQuestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [extractingMaterialId, setExtractingMaterialId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [questionMaterialFilter, setQuestionMaterialFilter] = useState<string>('');

  // Set as current subject on mount
  useEffect(() => {
    if (subject) setCurrentSubject(subject);
  }, [subject, setCurrentSubject]);

  const fetchMaterials = useCallback(async () => {
    if (!subjectId) return;
    setLoadingMaterials(true);
    try {
      const res = await api.get<{ success: true; data: Material[] }>(`/subjects/${subjectId}/materials`);
      setMaterials(res.data.data);
    } catch { setMaterials([]); }
    finally { setLoadingMaterials(false); }
  }, [subjectId]);

  const fetchQuestions = useCallback(async () => {
    if (!subjectId) return;
    setLoadingQuestions(true);
    try {
      const res = await api.get<{ success: true; data: Question[] }>(`/subjects/${subjectId}/questions`);
      setQuestions(res.data.data);
    } catch { setQuestions([]); }
    finally { setLoadingQuestions(false); }
  }, [subjectId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Auto-refresh when materials are processing (poll every 3s)
  useEffect(() => {
    const hasProcessing = materials.some((m) => m.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchMaterials, 3000);
    return () => clearInterval(interval);
  }, [materials, fetchMaterials]);

  // Count questions per material (to show extraction status)
  const questionsPerMaterial = new Map<string, number>();
  for (const q of questions) {
    if (q.materialId) {
      questionsPerMaterial.set(q.materialId, (questionsPerMaterial.get(q.materialId) ?? 0) + 1);
    }
  }

  // Filter questions by selected material
  const filteredQuestions = questionMaterialFilter
    ? questions.filter((q) => q.materialId === questionMaterialFilter)
    : questions;

  // Upload handler - step 1: validate file, show type dialog
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !subjectId) return;
    e.target.value = '';

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.pdf', '.docx'].includes(ext)) { setUploadError('仅支持 PDF 和 Word 格式'); return; }
    if (file.size > 200 * 1024 * 1024) { setUploadError('文件大小超过 200MB'); return; }

    setPendingFile(file);
    setUploadType('exam_paper');
    setShowUploadDialog(true);
  };

  // Upload handler - step 2: confirm type and upload
  const handleConfirmUpload = async () => {
    if (!pendingFile || !subjectId) return;
    setShowUploadDialog(false);
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('materialType', uploadType);
      await api.post(`/subjects/${subjectId}/materials/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('资料上传成功，正在后台处理...');
      await fetchMaterials();
    } catch (err: any) {
      setUploadError(err?.response?.data?.error?.message || '上传失败');
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  };

  // Delete material - show dialog with option to delete questions
  const handleDeleteMaterial = (id: string, fileName: string) => {
    const qCount = questionsPerMaterial.get(id) ?? 0;
    setDeleteWithQuestions(false);
    setShowDeleteDialog({ id, name: fileName, questionCount: qCount });
  };

  const handleConfirmDelete = async () => {
    if (!showDeleteDialog) return;
    const { id } = showDeleteDialog;
    setShowDeleteDialog(null);
    try {
      await api.delete(`/materials/${id}`, {
        params: { deleteQuestions: deleteWithQuestions ? 'true' : 'false' },
      });
      await fetchMaterials();
      if (deleteWithQuestions) {
        await fetchQuestions();
        await refreshDashboard();
      }
    } catch { /* ignore */ }
  };

  // Extract/generate questions from a single material (auto-select mode based on type)
  const handleExtractSingle = async (materialId: string) => {
    setExtractingMaterialId(materialId);
    setGenError(null);
    // Auto-select mode: exam_paper/wrong_questions → extract, others → generate
    const material = materials.find((m) => m.id === materialId);
    const mode = (material?.materialType === 'exam_paper' || material?.materialType === 'wrong_questions')
      ? 'extract' : 'generate';
    try {
      const res = await api.post<{ success: true; data: unknown[] }>(`/subjects/${subjectId}/questions/generate`, {
        materialIds: [materialId],
        mode,
      });
      const count = res.data.data?.length ?? 0;
      toast.success(count > 0 ? `成功生成 ${count} 道题目` : '未能从该资料生成题目，请检查内容');
      await fetchQuestions();
      await refreshDashboard();
    } catch (err: any) {
      setGenError(err?.response?.data?.error?.message || '提取失败');
    } finally { setExtractingMaterialId(null); }
  };

  // Extract all unprocessed materials (auto-select mode per material type)
  const handleExtractAll = async () => {
    const unextracted = materials.filter((m) => m.status === 'ready' && !questionsPerMaterial.has(m.id));
    if (unextracted.length === 0) { setGenError('所有资料已提取完毕'); return; }
    setExtractingMaterialId('all');
    setGenError(null);

    // Group by mode
    const examPapers = unextracted.filter((m) => m.materialType === 'exam_paper' || m.materialType === 'wrong_questions');
    const otherMaterials = unextracted.filter((m) => m.materialType !== 'exam_paper' && m.materialType !== 'wrong_questions');

    try {
      if (examPapers.length > 0) {
        await api.post(`/subjects/${subjectId}/questions/generate`, {
          materialIds: examPapers.map((m) => m.id),
          mode: 'extract',
        });
      }
      if (otherMaterials.length > 0) {
        await api.post(`/subjects/${subjectId}/questions/generate`, {
          materialIds: otherMaterials.map((m) => m.id),
          mode: 'generate',
        });
      }
      await fetchQuestions();
      await refreshDashboard();
    } catch (err: any) {
      setGenError(err?.response?.data?.error?.message || '提取失败');
    } finally { setExtractingMaterialId(null); }
  };

  // AI generate new questions from all materials
  const handleGenerate = async () => {
    const readyMaterials = materials.filter((m) => m.status === 'ready');
    if (readyMaterials.length === 0) { setGenError('没有已就绪的资料'); return; }
    setGenerating(true);
    setGenError(null);
    try {
      await api.post(`/subjects/${subjectId}/questions/generate`, {
        materialIds: readyMaterials.map((m) => m.id),
        mode: 'generate',
      });
      await fetchQuestions();
      await refreshDashboard();
    } catch (err: any) {
      setGenError(err?.response?.data?.error?.message || '生成失败');
    } finally { setGenerating(false); }
  };

  // Smart exam planning: AI selects questions from the pool
  // Exam dialog state
  const [showExamDialog, setShowExamDialog] = useState(false);
  const [examSelectedMaterials, setExamSelectedMaterials] = useState<string[]>([]);
  const [examMode, setExamMode] = useState<'smart' | 'all'>('smart');

  const handleOpenExamDialog = () => {
    setExamSelectedMaterials([]);
    setExamMode('smart');
    setShowExamDialog(true);
  };

  const handleConfirmExam = async () => {
    if (questions.length === 0) return;
    setShowExamDialog(false);
    setPlanning(true);
    setGenError(null);

    // Filter questions by selected materials
    const targetQuestions = examSelectedMaterials.length > 0
      ? questions.filter((q) => q.materialId && examSelectedMaterials.includes(q.materialId))
      : questions;

    if (targetQuestions.length === 0) {
      setGenError('所选资料中没有题目');
      setPlanning(false);
      return;
    }

    try {
      if (examMode === 'smart') {
        const res = await api.post<{ success: true; data: { session: { id: string }; questions: Question[]; totalSelected: number } }>(
          `/subjects/${subjectId}/exams/plan`,
          { questionCount: Math.min(20, targetQuestions.length) }
        );
        navigate('/exam', { state: { sessionId: res.data.data.session.id, questions: res.data.data.questions } });
      } else {
        const res = await api.post<{ success: true; data: { session: { id: string }; questions: Question[] } }>(
          `/subjects/${subjectId}/exams`,
          { questionIds: targetQuestions.map((q) => q.id) }
        );
        navigate('/exam', { state: { sessionId: res.data.data.session.id, questions: res.data.data.questions } });
      }
    } catch (err: any) {
      setGenError(err?.response?.data?.error?.message || '组卷失败');
    } finally { setPlanning(false); }
  };

  if (!subject) {
    return (
      <EmptyState
        icon={<FolderOpen size={48} />}
        title="学科不存在或已被删除"
        minHeight={400}
        action={<Button onClick={() => navigate('/subjects')}>返回学科列表</Button>}
      />
    );
  }

  const readyCount = materials.filter((m) => m.status === 'ready').length;
  const unextractedCount = materials.filter((m) => m.status === 'ready' && !questionsPerMaterial.has(m.id)).length;
  const accuracyPercent = stats ? Math.round(stats.accuracy * 100) : 0;

  return (
    <div style={{ maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <button onClick={() => navigate('/subjects')} aria-label="返回" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#6B7280' }}><ArrowLeft size={20} /></button>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>{subject.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
          <Card style={{ padding: '16px 24px', flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#6248F1' }}>{questions.length}</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>题库总数</div>
          </Card>
          <Card style={{ padding: '16px 24px', flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#10B981' }}>{accuracyPercent}%</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>正确率</div>
          </Card>
          <Card style={{ padding: '16px 24px', flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#3B82F6' }}>{materials.length}</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>资料数</div>
          </Card>
        </div>
      </div>

      {/* Materials Section */}
      <Card style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>学习资料</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {unextractedCount > 0 && (
              <Button
                variant="success"
                size="sm"
                onClick={handleExtractAll}
                disabled={extractingMaterialId !== null}
                loading={extractingMaterialId === 'all'}
              >
                {extractingMaterialId === 'all' ? '提取中' : `提取(${unextractedCount})`}
              </Button>
            )}
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} loading={uploading}>
              {uploading ? '上传中' : '上传'}
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx" onChange={handleFileSelect} style={{ display: 'none' }} />
        </div>

        {uploadError && (
          <div style={{ marginBottom: '12px', padding: '10px 14px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '8px', fontSize: '13px' }}>{uploadError}</div>
        )}

        {loadingMaterials ? (
          <SkeletonList rows={3} />
        ) : materials.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            title="还没有学习资料"
            description="上传带答案的试卷或学习资料，AI 将自动提取题目存入题库"
            minHeight={160}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {materials.map((m) => {
              const extractedCount = questionsPerMaterial.get(m.id) ?? 0;
              const isExtracted = extractedCount > 0;
              const isExtracting = extractingMaterialId === m.id;

              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#FAFBFC', borderRadius: '10px', border: '1px solid #F3F4F6' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#1F2937' }}>{m.fileName}</span>
                      <Badge variant="neutral">{MATERIAL_TYPE_LABELS[m.materialType || 'reference'] || '参考'}</Badge>
                      {m.status === 'ready' ? (
                        <Badge variant="success">就绪</Badge>
                      ) : m.status === 'failed' ? (
                        <Badge variant="danger">失败</Badge>
                      ) : (
                        <Badge variant="warning"><span className="spinner-dot" /> 处理中...</Badge>
                      )}
                      {isExtracted && (
                        <Badge variant="primary">已提取 {extractedCount} 题</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>{formatTime(m.uploadedAt)} · {formatFileSize(m.fileSize)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {m.status === 'ready' && !isExtracted && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleExtractSingle(m.id)}
                        disabled={extractingMaterialId !== null}
                        loading={isExtracting}
                      >
                        {isExtracting
                          ? 'AI 处理中'
                          : (m.materialType === 'exam_paper' || m.materialType === 'wrong_questions') ? '提取题目' : '生成题目'}
                      </Button>
                    )}
                    <button onClick={() => handleDeleteMaterial(m.id, m.fileName)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }} title="删除" aria-label={`删除资料: ${m.fileName}`}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Questions & Exam Section */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>题库 ({filteredQuestions.length} 题)</h3>
          <Button onClick={handleGenerate} disabled={generating || readyCount === 0} loading={generating}>
            <Sparkles size={15} />
            {generating ? '生成中...' : 'AI 补充出题'}
          </Button>
        </div>

        {/* Material filter */}
        {materials.length > 1 && questions.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <select
              value={questionMaterialFilter}
              onChange={(e) => setQuestionMaterialFilter(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff', outline: 'none' }}
            >
              <option value="">全部资料</option>
              {materials.filter((m) => questionsPerMaterial.has(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fileName.length > 25 ? m.fileName.slice(0, 25) + '...' : m.fileName} ({questionsPerMaterial.get(m.id)} 题)
                </option>
              ))}
            </select>
          </div>
        )}

        {(extractingMaterialId || generating) && (
          <div style={{ marginBottom: '12px', padding: '12px 16px', backgroundColor: '#EDE9FE', color: '#6248F1', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="spinner-dot" />
            {extractingMaterialId ? 'AI 正在从资料中提取题目，请稍候（通常需要 30-60 秒）...' : 'AI 正在生成题目...'}
          </div>
        )}

        {genError && (
          <div style={{ marginBottom: '12px', padding: '10px 14px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '8px', fontSize: '13px' }}>{genError}</div>
        )}

        {loadingQuestions ? (
          <SkeletonList rows={4} />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<PenLine size={32} />}
            title="暂无题目"
            description="上传资料后点击「提取」按钮将题目存入题库"
            minHeight={160}
          />
        ) : (
          <>
            {/* Exam actions */}
            <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#FAFBFC', borderRadius: '10px', border: '1px solid #F3F4F6' }}>
              <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>
                题库包含来自 {questionsPerMaterial.size} 份资料的题目，支持混合答题
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button variant="warning" onClick={handleOpenExamDialog} disabled={planning} loading={planning}>
                  <PenLine size={15} />
                  {planning ? '组卷中...' : '开始答题'}
                </Button>
              </div>
              <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '10px 0 0 0' }}>
                点击「开始答题」可选择资料范围和组卷模式
              </p>
            </div>

            {/* Question list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
              {filteredQuestions.map((q, i) => {
                const materialName = materials.find((m) => m.id === q.materialId)?.fileName;
                return (
                  <div key={q.id} style={{ padding: '10px 14px', backgroundColor: '#FAFBFC', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 500 }}>#{i + 1}</span>
                      <Badge variant="primary">{TYPE_LABELS[q.type] || q.type}</Badge>
                      {materialName && (
                        <span style={{ fontSize: '10px', color: '#9CA3AF' }}>
                          来自: {materialName.length > 15 ? materialName.slice(0, 15) + '...' : materialName}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#1F2937', lineHeight: 1.4 }}>
                      {q.stem.length > 100 ? q.stem.slice(0, 100) + '...' : q.stem}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Exam Planning Dialog */}
      {showExamDialog && (
        <div className="dialog-overlay" onClick={() => setShowExamDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" style={{ width: '460px' }}>
            <h3 className="dialog-title">组卷设置</h3>
            <div className="dialog-body">
              {/* Mode selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: 500 }}>组卷模式</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{
                    flex: 1, padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                    border: examMode === 'smart' ? '2px solid #6248F1' : '1px solid #E5E7EB',
                    backgroundColor: examMode === 'smart' ? '#EDE9FE' : '#fff',
                  }}>
                    <input type="radio" name="examMode" checked={examMode === 'smart'} onChange={() => setExamMode('smart')} style={{ display: 'none' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: examMode === 'smart' ? '#6248F1' : '#1F2937' }}>AI 智能组卷</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>根据掌握程度，优先薄弱知识点</div>
                  </label>
                  <label style={{
                    flex: 1, padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                    border: examMode === 'all' ? '2px solid #6248F1' : '1px solid #E5E7EB',
                    backgroundColor: examMode === 'all' ? '#EDE9FE' : '#fff',
                  }}>
                    <input type="radio" name="examMode" checked={examMode === 'all'} onChange={() => setExamMode('all')} style={{ display: 'none' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: examMode === 'all' ? '#6248F1' : '#1F2937' }}>全部题目</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>使用所选资料的全部题目</div>
                  </label>
                </div>
              </div>

              {/* Material selection */}
              <div>
                <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: 500 }}>
                  选择资料范围 <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 400 }}>（不选则使用全部）</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                  {materials.filter((m) => questionsPerMaterial.has(m.id)).map((m) => {
                    const qCount = questionsPerMaterial.get(m.id) ?? 0;
                    const isChecked = examSelectedMaterials.includes(m.id);
                    return (
                      <label key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: isChecked ? '2px solid #6248F1' : '1px solid #E5E7EB',
                        backgroundColor: isChecked ? '#EDE9FE' : '#fff',
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setExamSelectedMaterials((prev) =>
                            prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                          )}
                          style={{ accentColor: '#6248F1' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</div>
                          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{qCount} 题</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn-dialog btn-cancel" onClick={() => setShowExamDialog(false)}>取消</button>
              <button className="btn-dialog btn-confirm" onClick={handleConfirmExam}>
                {examMode === 'smart' ? 'AI 智能组卷' : '开始答题'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Type Dialog */}
      {showUploadDialog && pendingFile && (
        <div className="dialog-overlay" onClick={() => { setShowUploadDialog(false); setPendingFile(null); }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3 className="dialog-title">选择资料类型</h3>
            <div className="dialog-body">
              <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 12px 0' }}>
                文件: <strong>{pendingFile.name}</strong>
              </p>
              <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 16px 0' }}>
                选择正确的类型有助于 AI 采用最优策略处理资料
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { value: 'exam_paper', label: '真题 / 试卷', desc: '带答案的考试题' },
                  { value: 'textbook', label: '教材', desc: '课本/教程内容' },
                  { value: 'notes', label: '笔记', desc: '个人学习笔记' },
                  { value: 'slides', label: 'PPT / 课件', desc: '演示文稿' },
                  { value: 'formula_sheet', label: '公式表', desc: '公式/定理汇总' },
                  { value: 'wrong_questions', label: '错题集', desc: '错题整理' },
                  { value: 'summary', label: '总结', desc: '知识点总结' },
                  { value: 'reference', label: '参考资料', desc: '其他参考' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px',
                      borderRadius: '10px',
                      border: uploadType === opt.value ? '2px solid #6248F1' : '1px solid #E5E7EB',
                      backgroundColor: uploadType === opt.value ? '#EDE9FE' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="materialType"
                      value={opt.value}
                      checked={uploadType === opt.value}
                      onChange={() => setUploadType(opt.value)}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{opt.label}</span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn-dialog btn-cancel" onClick={() => { setShowUploadDialog(false); setPendingFile(null); }}>取消</button>
              <button className="btn-dialog btn-confirm" onClick={handleConfirmUpload}>确认上传</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="dialog-overlay" onClick={() => setShowDeleteDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3 className="dialog-title">删除资料</h3>
            <div className="dialog-body">
              <p style={{ fontSize: '14px', color: '#1F2937', margin: '0 0 12px 0' }}>
                确定要删除「{showDeleteDialog.name}」吗？
              </p>
              {showDeleteDialog.questionCount > 0 && (
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  backgroundColor: deleteWithQuestions ? '#FEF2F2' : '#F9FAFB',
                  borderRadius: '8px',
                  border: deleteWithQuestions ? '1px solid #FECACA' : '1px solid #E5E7EB',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={deleteWithQuestions}
                    onChange={(e) => setDeleteWithQuestions(e.target.checked)}
                    style={{ accentColor: '#EF4444' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: deleteWithQuestions ? '#991B1B' : '#1F2937' }}>
                      同时删除关联的 {showDeleteDialog.questionCount} 道题目
                    </div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                      不勾选则仅删除资料文件，题目保留在题库中
                    </div>
                  </div>
                </label>
              )}
            </div>
            <div className="dialog-actions">
              <button className="btn-dialog btn-cancel" onClick={() => setShowDeleteDialog(null)}>取消</button>
              <button
                className="btn-dialog"
                onClick={handleConfirmDelete}
                style={{ backgroundColor: '#EF4444', color: '#fff' }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, FileText, Sparkles } from 'lucide-react';
import { useSubject } from '../contexts/SubjectContext';
import { Card, Badge, Button, EmptyState, SkeletonList } from '../components/ui';
import { api } from '../services/api';

type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';

interface Question {
  id: string;
  subjectId: string;
  materialId: string | null;
  type: QuestionType;
  stem: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  createdAt: string;
}

interface Material {
  id: string;
  fileName: string;
  status: string;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
};

const QUESTION_TYPES: QuestionType[] = ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer'];

export function QuestionsPage() {
  const { currentSubject } = useSubject();

  // Questions list state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [typeFilter, setTypeFilter] = useState<QuestionType | ''>('');
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Generate form state
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    if (!currentSubject) return;
    setLoadingQuestions(true);
    try {
      const params = typeFilter ? `?type=${typeFilter}` : '';
      const res = await api.get<{ success: true; data: Question[] }>(
        `/subjects/${currentSubject.id}/questions${params}`
      );
      setQuestions(res.data.data);
    } catch {
      setQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  }, [currentSubject, typeFilter]);

  const fetchMaterials = useCallback(async () => {
    if (!currentSubject) return;
    try {
      const res = await api.get<{ success: true; data: Material[] }>(
        `/subjects/${currentSubject.id}/materials`
      );
      setMaterials(res.data.data);
    } catch {
      setMaterials([]);
    }
  }, [currentSubject]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleMaterialToggle = (materialId: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId]
    );
  };

  const handleExtract = async () => {
    if (!currentSubject || selectedMaterialIds.length === 0) {
      setGenerateError('请至少选择一份资料');
      return;
    }
    setExtracting(true);
    setGenerateError(null);
    try {
      await api.post(`/subjects/${currentSubject.id}/questions/generate`, {
        materialIds: selectedMaterialIds,
        mode: 'extract',
      });
      await fetchQuestions();
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || '提取失败，请稍后重试';
      setGenerateError(errorMessage);
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async () => {
    if (!currentSubject || selectedMaterialIds.length === 0) {
      setGenerateError('请至少选择一份资料');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      await api.post(`/subjects/${currentSubject.id}/questions/generate`, {
        materialIds: selectedMaterialIds,
        mode: 'generate',
      });
      await fetchQuestions();
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || '生成失败，请稍后重试';
      setGenerateError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  if (!currentSubject) {
    return (
      <EmptyState
        icon={<FolderOpen size={48} />}
        title="请先在左侧选择一个学科"
        description="选择学科后即可管理该学科的题库"
        minHeight={400}
      />
    );
  }

  return (
    <div style={{ padding: '0', maxWidth: '1000px' }}>
      <h2 style={{ marginBottom: '28px', fontSize: '24px', fontWeight: 700 }}>题库管理</h2>

      {/* Generate Questions Form */}
      <Card style={{ marginBottom: '28px' }}>
        <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>生成考题</h3>

        <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '16px' }}>
          选择资料后，AI 将自动规划题型分布和数量。「提取题目」适用于带答案的试卷；「AI 生成」适用于教材/笔记等资料。
        </p>

        {/* Material Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 500, fontSize: '14px', color: '#1F2937' }}>
            选择资料：
          </label>
          {materials.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '14px' }}>暂无可用资料，请先上传并处理资料</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {materials.map((material) => (
                <label key={material.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: selectedMaterialIds.includes(material.id) ? '2px solid #6248F1' : '1px solid #E5E7EB',
                  backgroundColor: selectedMaterialIds.includes(material.id) ? '#EDE9FE' : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedMaterialIds.includes(material.id)}
                    onChange={() => handleMaterialToggle(material.id)}
                    disabled={generating || extracting}
                    style={{ accentColor: '#6248F1' }}
                  />
                  <span style={{ color: '#1F2937' }}>{material.fileName}</span>
                  <span style={{ color: '#9CA3AF', fontSize: '12px' }}>({material.status})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button
            variant="success"
            onClick={handleExtract}
            disabled={extracting || generating || selectedMaterialIds.length === 0}
            loading={extracting}
          >
            <FileText size={15} />
            {extracting ? '提取中...' : '提取题目'}
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || extracting || selectedMaterialIds.length === 0}
            loading={generating}
          >
            <Sparkles size={15} />
            {generating ? '生成中...' : 'AI 生成'}
          </Button>
        </div>

        {/* Error Message */}
        {generateError && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: '#FEE2E2',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '14px',
            border: '1px solid #FECACA',
          }}>
            {generateError}
          </div>
        )}
      </Card>

      {/* Questions List */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1F2937' }}>题目列表</h3>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as QuestionType | '')}
            style={{
              padding: '6px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              color: '#1F2937',
              backgroundColor: '#fff',
            }}
          >
            <option value="">全部</option>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>

        {loadingQuestions ? (
          <SkeletonList rows={4} />
        ) : questions.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: '14px', textAlign: 'center', padding: '24px' }}>暂无题目，请先生成考题</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {questions.map((question) => (
              <div
                key={question.id}
                style={{
                  padding: '16px 20px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '10px',
                  backgroundColor: '#FAFBFC',
                  transition: 'box-shadow 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Badge variant="primary">{TYPE_LABELS[question.type]}</Badge>
                  <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    答案: {question.correctAnswer}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#1F2937', lineHeight: 1.6, margin: 0 }}>
                  {question.stem.length > 100 ? question.stem.slice(0, 100) + '...' : question.stem}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

import OpenAI from 'openai';
import { withCache } from './ai-cache.js';
import type { KnowledgePoint, QuestionType, GeneratedQuestion, ExamDataForAnalysis, AnalysisReport } from '../types.js';

/** 主观题评分 system prompt */
const SCORING_SYSTEM_PROMPT = `你是一位严谨公正的考试评分专家。你的任务是根据题目、参考答案和学生作答，给出客观的评分和评分理由。

评分规则：
1. 分数范围为 0 到 1（0 表示完全错误，1 表示完全正确）
2. 评分应考虑以下维度：
   - 答案的准确性：核心知识点是否正确
   - 答案的完整性：是否覆盖了参考答案的关键要点
   - 表述的清晰度：逻辑是否通顺、表达是否清楚
3. 如果学生作答为空或完全无关，给 0 分
4. 如果学生作答包含核心要点但不够完整，给 0.3-0.7 分
5. 如果学生作答基本覆盖参考答案要点且表述清晰，给 0.7-1 分

你必须以 JSON 格式返回结果，包含以下字段：
- "score": 数字，范围 0-1，保留两位小数
- "reason": 字符串，简要说明评分理由（不超过 200 字）`;

/** 知识点提取 system prompt */
const KNOWLEDGE_EXTRACTION_PROMPT = `你是一位专业的教育内容分析专家。你的任务是从给定的学习资料文本中提取关键知识点。

请分析以下文本内容，提取其中的核心知识点。每个知识点应包含：
- title: 知识点的简洁标题（不超过20个字）
- description: 对该知识点的简要描述或解释（1-2句话）

要求：
1. 知识点应覆盖文本中的主要概念和重要信息
2. 每个知识点应独立且不重复
3. 按照知识点在文本中出现的逻辑顺序排列
4. 提取的知识点数量应与文本内容的丰富程度相匹配（通常5-20个）

请以 JSON 格式返回结果，格式如下：
{
  "knowledgePoints": [
    { "title": "知识点标题", "description": "知识点描述" }
  ]
}`;

/** 考后分析报告 system prompt */
const ANALYSIS_PROMPT = `你是一位资深教育诊断专家，拥有 10 年以上考试分析经验。请基于学生的答题数据，生成一份**深度、专业、可执行**的考后诊断报告。

## 分析框架

### 1. 薄弱知识点诊断 (weakPoints)
不要只列知识点名称。请做到：
- 按严重程度排序（最薄弱的排最前）
- 每个薄弱点说明**具体表现**（如"混淆了A和B的区别"而非"A掌握不好"）
- 如果能识别出**系统性问题**（如"所有涉及XX类型的题都错"），优先指出
- 区分"完全不会"和"理解但易错"两种情况

### 2. 错题深度分析 (errorAnalysis)
对每道错题，分析必须包含：
- **错误类型分类**：概念混淆 / 知识盲区 / 审题失误 / 计算错误 / 记忆模糊 / 理解偏差
- **具体错因**：不是泛泛而谈，而是精确到"学生可能把X理解成了Y"
- **关联知识**：这道题背后需要掌握的核心知识是什么
- 如果学生答案部分正确，指出正确的部分和错误的部分

### 3. 提升行动计划 (suggestions)
不要给"多做题""多复习"这种废话建议。要求：
- 每条建议必须**具体到可以立即执行**
- 按优先级排序（投入产出比最高的排前面）
- 包含**学习方法建议**（如"用对比表格区分A和B"）
- 包含**练习策略**（如"先做10道XX类型基础题巩固概念，再做综合题"）
- 如果发现学生某类题全对，可以建议"跳过XX，集中精力攻克YY"
- 给出预计需要的复习时间估算

## 输出格式（严格 JSON）
{
  "weakPoints": [
    "【严重】具体薄弱点描述1",
    "【中等】具体薄弱点描述2",
    "【轻微】具体薄弱点描述3"
  ],
  "errorAnalysis": [
    {
      "questionId": "题目ID",
      "reason": "【错误类型】具体分析：学生可能...，正确理解应该是...，背后需要掌握的知识是..."
    }
  ],
  "suggestions": [
    "【优先级1】具体行动：...",
    "【优先级2】具体行动：...",
    "【优先级3】具体行动：..."
  ]
}

## 重要原则
- 宁可少说几条但每条都有深度，不要凑数量
- 如果学生全对，weakPoints 写"暂无明显薄弱点"，suggestions 写进阶建议
- 分析要基于题目内容和学生答案的对比，不要凭空猜测
- 使用中文，语气专业但不生硬`;

/** 考题生成 system prompt */
const QUESTION_GENERATION_PROMPT = `你是一位专业的考试出题专家。请根据用户提供的学习资料文本和知识点列表，按照指定的题型数量分布生成高质量的考题。

要求：
1. 题目必须紧密围绕提供的资料内容和知识点
2. 每道题必须包含：题干(stem)、正确答案(correctAnswer)、答案解析(explanation)
3. 单选题和多选题必须包含至少4个选项(options)，选项用 A、B、C、D 等字母标记
4. 单选题的 correctAnswer 为单个字母（如 "A"）
5. 多选题的 correctAnswer 为逗号分隔的字母（如 "A,B,C"）
6. 判断题的 correctAnswer 为 "正确" 或 "错误"
7. 填空题的 correctAnswer 为填空的答案文本
8. 简答题的 correctAnswer 为参考答案
9. 题目难度适中，覆盖不同知识点
10. 如果提供了知识点列表，尽量为每道题关联一个知识点ID(knowledgePointId)

请以 JSON 格式返回，结构如下：
{
  "questions": [
    {
      "type": "single_choice" | "multiple_choice" | "true_false" | "fill_blank" | "short_answer",
      "stem": "题干内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "correctAnswer": "正确答案",
      "explanation": "答案解析",
      "knowledgePointId": "关联的知识点ID（可选）"
    }
  ]
}

注意：
- options 字段仅在 single_choice 和 multiple_choice 题型中需要提供
- 判断题、填空题、简答题不需要 options 字段
- 确保所有题目的答案准确、解析清晰`;

/** 从试卷中提取题目 system prompt */
const QUESTION_EXTRACTION_PROMPT = `你是一位专业的试卷分析专家。你的任务是从用户提供的试卷/习题文本中，精确提取出所有题目，并将题目与答案正确分离配对。

这些资料通常是"带答案版本"的试卷或习题集，答案可能在题目后面、文档末尾的"参考答案"部分、或以其他方式标注。

请严格按照以下规则提取：

1. 识别每道题的题型：
   - single_choice: 单选题（有多个选项，只有一个正确答案）
   - multiple_choice: 多选题（有多个选项，有多个正确答案）
   - true_false: 判断题（判断对错）
   - fill_blank: 填空题（填写答案）
   - short_answer: 简答题/论述题/计算题

2. 对于每道题，提取：
   - stem: 完整的题干文本
   - options: 选择题的选项列表（格式如 ["A. xxx", "B. xxx", "C. xxx", "D. xxx"]）
   - correctAnswer: 正确答案
     * 单选题: 单个字母如 "A"
     * 多选题: 逗号分隔的字母如 "A,B,C"
     * 判断题: "正确" 或 "错误"
     * 填空题: 答案文本
     * 简答题: 参考答案全文
   - explanation: 答案解析（如果原文有解析则提取，没有则根据题目和答案简要生成）

3. 重要规则：
   - 保持题干的完整性，不要截断
   - 选项文本要完整保留
   - 如果答案在文档末尾的"参考答案"区域，要正确匹配到对应题目
   - 如果无法确定某题的答案，correctAnswer 填 "未知"，explanation 填 "原文未提供答案"
   - 按照题目在原文中出现的顺序排列

请以 JSON 格式返回：
{
  "questions": [
    {
      "type": "single_choice",
      "stem": "题干内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "correctAnswer": "A",
      "explanation": "答案解析"
    }
  ]
}`;

/** AI 自动生成题目（自动决定题型分布）system prompt */
const AUTO_GENERATE_PROMPT = `你是一位专业的考试出题专家。请根据用户提供的学习资料文本，自动分析内容特点，生成适合的考题。

你需要自行决定：
- 生成多少道题（通常 10-20 道，根据资料内容丰富程度决定）
- 各题型的分布（根据内容特点选择合适的题型组合）

题型说明：
- single_choice: 适合考察概念辨析、事实记忆
- multiple_choice: 适合考察多维度理解
- true_false: 适合考察常见误区
- fill_blank: 适合考察关键术语、公式
- short_answer: 适合考察综合理解和应用

格式要求：
1. 单选题和多选题必须包含至少4个选项(options)
2. 单选题 correctAnswer 为单个字母（如 "A"）
3. 多选题 correctAnswer 为逗号分隔的字母（如 "A,B,C"）
4. 判断题 correctAnswer 为 "正确" 或 "错误"
5. 填空题 correctAnswer 为答案文本
6. 简答题 correctAnswer 为参考答案
7. 每道题必须有 explanation（答案解析）

请以 JSON 格式返回：
{
  "questions": [
    {
      "type": "single_choice" | "multiple_choice" | "true_false" | "fill_blank" | "short_answer",
      "stem": "题干内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "correctAnswer": "正确答案",
      "explanation": "答案解析"
    }
  ]
}

注意：options 字段仅在 single_choice 和 multiple_choice 题型中需要提供。`;

/**
 * AI 服务基础类
 * 使用 OpenAI SDK 兼容模式连接 DeepSeek API
 */
export class AIService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  /** 子类可通过此 getter 访问 OpenAI 客户端 */
  protected get openaiClient(): OpenAI {
    return this.client;
  }

  /**
   * 测试 API 连接是否正常
   * 发送一个最小请求验证密钥有效性
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 分析文本内容，提取结构化知识点列表
   * @param text 待分析的资料文本内容
   * @returns 知识点数组（不含 id，由调用方分配）
   */
  async analyzeKnowledgePoints(text: string): Promise<Omit<KnowledgePoint, 'id'>[]> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: KNOWLEDGE_EXTRACTION_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as { knowledgePoints: Omit<KnowledgePoint, 'id'>[] };
    return parsed.knowledgePoints ?? [];
  }

  /**
   * 生成考题
   * 根据资料文本、知识点和题型数量分布，调用 DeepSeek API 生成考题
   * @param params.text 学习资料文本内容
   * @param params.knowledgePoints 已提取的知识点列表
   * @param params.counts 各题型的生成数量分布
   * @returns 生成的考题数组
   */
  async generateQuestions(params: {
    text: string;
    knowledgePoints: KnowledgePoint[];
    counts: Record<QuestionType, number>;
  }): Promise<GeneratedQuestion[]> {
    const { text, knowledgePoints, counts } = params;

    const totalCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (totalCount === 0) {
      return [];
    }

    const userContent = JSON.stringify({
      text,
      knowledgePoints,
      counts,
    });

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: QUESTION_GENERATION_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };
    return parsed.questions;
  }

  /**
   * 生成考后分析报告
   * 将答题数据发送至 DeepSeek API，获取薄弱知识点、错题原因分析和提升建议
   * @param examData 考试数据（题目、用户作答、得分、知识点）
   * @returns 分析报告（薄弱知识点、错题原因、提升建议）
   */
  async generateAnalysisReport(examData: ExamDataForAnalysis): Promise<AnalysisReport> {
    // Send richer data for better analysis
    const limitedData = {
      ...examData,
      questions: examData.questions.slice(0, 30).map((q) => ({
        ...q,
        stem: q.stem.slice(0, 200), // More context for better analysis
      })),
      answers: examData.answers.slice(0, 30),
      // Add summary stats to help AI understand overall performance
      summary: {
        totalQuestions: examData.questions.length,
        correctCount: examData.answers.filter((a) => a.score >= a.maxScore).length,
        wrongCount: examData.answers.filter((a) => a.score < a.maxScore).length,
        scoreRate: examData.answers.length > 0
          ? examData.answers.reduce((s, a) => s + a.score, 0) / examData.answers.reduce((s, a) => s + a.maxScore, 0)
          : 0,
      },
    };

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: JSON.stringify(limitedData) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('AI 分析报告生成失败：未收到有效响应');
    }

    try {
      const report: AnalysisReport = JSON.parse(content);
      return {
        weakPoints: report.weakPoints ?? [],
        errorAnalysis: report.errorAnalysis ?? [],
        suggestions: report.suggestions ?? [],
      };
    } catch {
      // Try to salvage truncated JSON
      return {
        weakPoints: ['分析数据解析异常'],
        errorAnalysis: [],
        suggestions: ['请重试生成分析报告'],
      };
    }
  }

  /**
   * 主观题 AI 评分
   * 将题干、参考答案和用户作答发送至 DeepSeek API 进行评分
   * @returns 归一化分数 (0-1) 和评分理由
   */
  async scoreSubjectiveAnswer(params: {
    stem: string;
    referenceAnswer: string;
    userAnswer: string;
  }): Promise<{ score: number; reason: string }> {
    const userMessage = JSON.stringify({
      题目: params.stem,
      参考答案: params.referenceAnswer,
      学生作答: params.userAnswer,
    });

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SCORING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('AI 评分返回内容为空');
    }

    const result = JSON.parse(content) as { score: number; reason: string };

    // Clamp score to [0, 1] range for safety
    const score = Math.max(0, Math.min(1, result.score));

    return {
      score,
      reason: result.reason,
    };
  }

  /**
   * 从试卷/习题文本中提取题目和答案
   * 支持 Strategy 增强 prompt
   * @param text 试卷文本内容
   * @param strategyHint 可选的策略增强指令
   * @returns 提取的题目数组（含正确答案和解析）
   */
  async extractQuestionsFromPaper(text: string, strategyHint?: string): Promise<GeneratedQuestion[]> {
    const systemPrompt = strategyHint
      ? `${QUESTION_EXTRACTION_PROMPT}\n\n【额外指令】${strategyHint}`
      : QUESTION_EXTRACTION_PROMPT;

    // Limit input text to avoid response truncation (DeepSeek context ~128K tokens)
    const truncatedText = text.length > 25000 ? text.slice(0, 25000) + '\n\n[...文本已截断，请基于以上内容提取题目]' : text;

    const cacheContent = truncatedText + '::' + (strategyHint ?? '');
    const responseContent = await withCache(cacheContent, 'extract_questions', async () => {
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedText },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
      });
      const content = response.choices[0].message.content;
      if (!content) throw new Error('AI 提取题目失败：未收到有效响应');
      return { content, model: 'deepseek-chat', tokens: response.usage?.total_tokens };
    });

    return this.safeParseQuestions(responseContent);
  }

  /**
   * 根据资料内容自动生成题目（AI 自动决定题型分布和数量）
   * 支持 Strategy 增强 prompt
   * @param text 学习资料文本内容
   * @param strategyHint 可选的策略增强指令
   * @returns 生成的题目数组
   */
  async autoGenerateQuestions(text: string, strategyHint?: string): Promise<GeneratedQuestion[]> {
    const systemPrompt = strategyHint
      ? `${AUTO_GENERATE_PROMPT}\n\n【额外指令】${strategyHint}`
      : AUTO_GENERATE_PROMPT;

    // Limit input text
    const truncatedText = text.length > 25000 ? text.slice(0, 25000) + '\n\n[...文本已截断，请基于以上内容生成题目]' : text;

    const cacheContent = truncatedText + '::' + (strategyHint ?? '');
    const responseContent = await withCache(cacheContent, 'auto_generate', async () => {
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedText },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
      });
      const content = response.choices[0].message.content;
      if (!content) throw new Error('AI 生成题目失败：未收到有效响应');
      return { content, model: 'deepseek-chat', tokens: response.usage?.total_tokens };
    });

    return this.safeParseQuestions(responseContent);
  }

  /**
   * 安全解析 AI 返回的 JSON（处理截断情况）
   */
  private safeParseQuestions(content: string): GeneratedQuestion[] {
    try {
      const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };
      return parsed.questions ?? [];
    } catch {
      // JSON 被截断，尝试修复：找到最后一个完整的题目对象
      try {
        // Find the last complete object by looking for the last "},"
        const lastComplete = content.lastIndexOf('},');
        if (lastComplete > 0) {
          const fixed = content.slice(0, lastComplete + 1) + ']}';
          const parsed = JSON.parse(fixed) as { questions: GeneratedQuestion[] };
          return parsed.questions ?? [];
        }
        // Try closing with just ]}
        const lastBrace = content.lastIndexOf('}');
        if (lastBrace > 0) {
          const fixed = content.slice(0, lastBrace + 1) + ']}';
          const parsed = JSON.parse(fixed) as { questions: GeneratedQuestion[] };
          return parsed.questions ?? [];
        }
      } catch {
        // Complete failure to parse
      }
      throw new Error('AI 返回的数据格式异常（JSON 被截断），请尝试减少资料内容后重试');
    }
  }

  /**
   * 智能组卷：从题库中选择题目，规划一份均衡的考试
   * AI 会分析题目的知识点覆盖、题型分布、难度等，选出最优组合
   * @param questions 题库中所有可用题目
   * @param materialSummaries 各资料的简要描述（帮助 AI 理解范围）
   * @returns 选中的题目 ID 列表
   */
  async planExam(params: {
    questions: Array<{ id: string; type: string; stem: string; materialId: string | null }>;
    materialSummaries: Array<{ id: string; fileName: string }>;
    totalQuestionCount?: number;
  }): Promise<string[]> {
    const { questions, materialSummaries, totalQuestionCount } = params;

    if (questions.length === 0) return [];
    // If few questions, just return all
    if (questions.length <= (totalQuestionCount ?? 20)) {
      return questions.map((q) => q.id);
    }

    const userContent = JSON.stringify({
      availableQuestions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        stem: q.stem.slice(0, 80),
        materialId: q.materialId,
      })),
      materials: materialSummaries,
      targetCount: totalQuestionCount ?? Math.min(20, questions.length),
    });

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一位专业的考试组卷专家。请从给定的题库中选择题目，组成一份均衡的考试。

选题原则：
1. 题型均衡：尽量覆盖多种题型（单选、多选、判断、填空、简答）
2. 资料覆盖：如果题目来自多份资料，尽量均匀覆盖各资料
3. 知识点覆盖：通过题干内容判断，避免重复考察同一知识点
4. 数量控制：选择指定数量的题目

请以 JSON 格式返回选中的题目 ID 列表：
{ "selectedIds": ["id1", "id2", ...] }`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      // Fallback: return first N questions
      return questions.slice(0, totalQuestionCount ?? 20).map((q) => q.id);
    }

    const parsed = JSON.parse(content) as { selectedIds: string[] };
    const validIds = new Set(questions.map((q) => q.id));
    const selected = (parsed.selectedIds ?? []).filter((id) => validIds.has(id));

    // If AI returned too few, pad with remaining questions
    if (selected.length < (totalQuestionCount ?? 20) * 0.5) {
      return questions.slice(0, totalQuestionCount ?? 20).map((q) => q.id);
    }

    return selected;
  }

  /**
   * OCR：通过 DeepSeek 视觉能力从图片/文档中提取文字
   * 用于扫描版 PDF 等无文字层的文档
   * @param base64Images base64 编码的图片数组（每页一张）
   * @returns 提取的文字内容
   */
  async ocrFromImages(base64Images: string[]): Promise<string> {
    if (base64Images.length === 0) return '';

    // Process images in batches (max 5 per request to avoid token limits)
    const batchSize = 5;
    const results: string[] = [];

    for (let i = 0; i < base64Images.length; i += batchSize) {
      const batch = base64Images.slice(i, i + batchSize);

      const imageContents = batch.map((img) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,${img}` },
      }));

      try {
        const response = await this.client.chat.completions.create({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '请提取这些图片中的所有文字内容，保持原始格式和结构。如果是试卷，请保留题号、选项标记等。直接输出提取的文字，不要添加任何额外说明。' },
                ...imageContents,
              ],
            },
          ],
          max_tokens: 4000,
        });

        const content = response.choices[0].message.content;
        if (content) results.push(content);
      } catch {
        // If vision API fails, skip this batch
        continue;
      }
    }

    return results.join('\n\n');
  }

  /**
   * OCR 备选方案：直接发送文本描述请求 AI 理解文档
   * 当视觉 API 不可用时，尝试用纯文本方式
   */
  async ocrFallback(pdfBase64: string, fileName: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${pdfBase64}` },
              },
              {
                type: 'text',
                text: `这是一个名为"${fileName}"的PDF文档。请提取其中所有的文字内容，保持原始结构。如果是试卷请保留题号和选项。`,
              },
            ],
          },
        ],
        max_tokens: 8000,
      });

      return response.choices[0].message.content ?? '';
    } catch {
      return '';
    }
  }
}

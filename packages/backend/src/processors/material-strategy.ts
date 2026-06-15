/**
 * Material Processing Strategy Pattern
 * 不同资料类型使用不同的处理策略
 */

export type MaterialType =
  | 'textbook'
  | 'notes'
  | 'slides'
  | 'exam_paper'
  | 'answer_sheet'
  | 'cheat_sheet'
  | 'formula_sheet'
  | 'wrong_questions'
  | 'summary'
  | 'reference';

export interface ProcessingStrategy {
  /** 处理优先级 (影响队列排序) */
  priority: number;
  /** AI prompt 类型标识 (用于缓存) */
  promptType: string;
  /** 推荐的处理动作 */
  recommendedActions: string[];
  /** 题目提取时的 AI 指令增强 */
  extractionHint: string;
  /** 知识点提取时的 AI 指令增强 */
  knowledgeHint: string;
  /** 认知层级偏好 (生成题目时优先的认知层级) */
  preferredCognitiveLevels: string[];
}

const STRATEGIES: Record<MaterialType, ProcessingStrategy> = {
  exam_paper: {
    priority: 10,
    promptType: 'exam_extraction',
    recommendedActions: ['extract_questions', 'analyze_frequency'],
    extractionHint: '这是一份真题/试卷。请精确提取每道题目，保留原始分值、题号。注意识别答案区域（可能在末尾）。对每道题标注难度(1-5)和认知层级(remember/understand/apply/analyze/evaluate/create)。',
    knowledgeHint: '分析这份试卷考察的知识点分布，标注每个知识点的出现频率和分值占比。',
    preferredCognitiveLevels: ['apply', 'analyze', 'evaluate'],
  },
  wrong_questions: {
    priority: 9,
    promptType: 'wrong_question_analysis',
    recommendedActions: ['extract_questions', 'analyze_error_patterns'],
    extractionHint: '这是一份错题集。请提取每道错题，特别注意：1)标注用户可能的错误原因 2)识别错误模式的共性 3)标注需要强化的知识点。',
    knowledgeHint: '分析这些错题的共同薄弱点，找出系统性的知识缺陷模式。',
    preferredCognitiveLevels: ['understand', 'apply'],
  },
  textbook: {
    priority: 8,
    promptType: 'textbook_analysis',
    recommendedActions: ['extract_knowledge_tree', 'generate_questions'],
    extractionHint: '这是教材内容。不要直接提取题目（教材通常没有现成题目）。而是：1)识别核心概念和定义 2)提取公式和定理 3)标注重点和难点 4)基于内容生成高质量题目，覆盖不同认知层级。',
    knowledgeHint: '构建这段教材的知识树：章节→知识点→子概念。标注每个知识点的重要度和前置依赖关系。',
    preferredCognitiveLevels: ['remember', 'understand', 'apply'],
  },
  formula_sheet: {
    priority: 7,
    promptType: 'formula_extraction',
    recommendedActions: ['extract_formulas', 'generate_calculation_questions'],
    extractionHint: '这是公式表。请：1)提取所有公式及其适用条件 2)基于公式生成计算题和填空题 3)生成"公式选择题"（给定场景选正确公式）。',
    knowledgeHint: '提取所有公式，标注适用范围、前置知识、易错点。',
    preferredCognitiveLevels: ['remember', 'apply'],
  },
  cheat_sheet: {
    priority: 7,
    promptType: 'cheat_sheet_extraction',
    recommendedActions: ['extract_key_concepts', 'generate_memory_questions'],
    extractionHint: '这是速记表/知识卡片。请提取关键概念，生成记忆类题目（判断题、填空题为主）。',
    knowledgeHint: '提取所有关键概念和速记要点。',
    preferredCognitiveLevels: ['remember', 'understand'],
  },
  notes: {
    priority: 6,
    promptType: 'notes_analysis',
    recommendedActions: ['ai_supplement', 'generate_from_notes'],
    extractionHint: '这是用户笔记。请：1)识别笔记中的知识点 2)发现可能遗漏的重要内容 3)基于笔记内容生成理解性题目。注意笔记可能不完整或有个人简写。',
    knowledgeHint: '分析笔记覆盖的知识点，指出可能遗漏的重要概念。',
    preferredCognitiveLevels: ['understand', 'apply'],
  },
  summary: {
    priority: 6,
    promptType: 'summary_analysis',
    recommendedActions: ['extract_key_points', 'generate_comprehensive_questions'],
    extractionHint: '这是学习总结。请基于总结内容生成综合性题目，侧重理解和应用层面。',
    knowledgeHint: '提取总结中的核心要点和结论。',
    preferredCognitiveLevels: ['understand', 'analyze'],
  },
  slides: {
    priority: 5,
    promptType: 'slides_extraction',
    recommendedActions: ['extract_structure', 'generate_concept_questions'],
    extractionHint: '这是PPT/演示文稿内容。请：1)识别每页的核心观点 2)提取结构化知识 3)生成概念理解题。',
    knowledgeHint: '提取PPT的知识结构和核心观点。',
    preferredCognitiveLevels: ['remember', 'understand'],
  },
  answer_sheet: {
    priority: 5,
    promptType: 'answer_extraction',
    recommendedActions: ['extract_answers'],
    extractionHint: '这是答案/解析。请提取每道题的答案和解析，用于与试卷配对。',
    knowledgeHint: '从答案解析中提取涉及的知识点。',
    preferredCognitiveLevels: ['understand'],
  },
  reference: {
    priority: 4,
    promptType: 'general_extraction',
    recommendedActions: ['extract_questions', 'generate_questions'],
    extractionHint: '这是参考资料。请根据内容特点，提取或生成适合的题目。',
    knowledgeHint: '提取资料中的核心知识点。',
    preferredCognitiveLevels: ['remember', 'understand', 'apply'],
  },
};

/**
 * 获取资料类型的处理策略
 */
export function getProcessingStrategy(materialType: string): ProcessingStrategy {
  return STRATEGIES[materialType as MaterialType] ?? STRATEGIES.reference;
}

/**
 * 获取所有支持的资料类型
 */
export function getSupportedMaterialTypes(): MaterialType[] {
  return Object.keys(STRATEGIES) as MaterialType[];
}

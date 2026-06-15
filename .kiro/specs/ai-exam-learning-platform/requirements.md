# Requirements Document

## Introduction

AI 考试学习平台是一个本地部署的 Web 应用，面向单用户使用。用户可上传 PDF/Word 格式的考试资料，系统通过 DeepSeek API 自动分析资料内容并生成多种题型的考题。平台支持在线答题、自动判分（客观题本地判分、主观题 AI 评分）、考后 AI 分析与提升建议，以及多学科独立管理和学习进度可视化。

## Glossary

- **Platform**: AI 考试学习平台系统整体，包含本地后端服务与浏览器前端界面
- **Backend**: 本地运行的后端服务，负责业务逻辑、数据存储与 API 调用
- **Frontend**: 浏览器中运行的前端界面，负责用户交互与数据展示
- **Document_Processor**: 负责从上传文件中抽取文本内容的模块
- **AI_Service**: 通过 DeepSeek API 提供题目生成、主观题评分、考后分析等智能服务的模块
- **Question_Generator**: 基于资料内容生成考题的子模块
- **Scoring_Engine**: 负责答题判分的模块，包含本地客观题判分和 AI 主观题评分
- **Analytics_Engine**: 负责考后分析、学习进度统计与趋势计算的模块
- **Subject**: 学科，用于隔离资料、题库和答题记录的顶层分类单元
- **Material**: 用户上传的考试资料文件（PDF 或 Word 格式）
- **Question**: 系统生成的考题，包含题干、选项（如适用）、正确答案和解析
- **Exam_Session**: 一次完整的答题过程，包含题目集合、用户作答和判分结果
- **Objective_Question**: 客观题，包括单选题、多选题、判断题、填空题
- **Subjective_Question**: 主观题，包括简答题

## Requirements

### Requirement 1: 资料上传

**User Story:** As a 学习者, I want 上传 PDF 和 Word 格式的考试资料, so that 系统可以基于这些资料生成考题

#### Acceptance Criteria

1. WHEN 用户选择一个 PDF 格式文件并提交上传, THE Platform SHALL 接收该文件并将其存储到当前 Subject 的资料目录中
2. WHEN 用户选择一个 Word 格式文件（.docx）并提交上传, THE Platform SHALL 接收该文件并将其存储到当前 Subject 的资料目录中
3. IF 用户上传的文件格式不是 PDF 或 Word, THEN THE Platform SHALL 拒绝该文件并显示"仅支持 PDF 和 Word 格式"的提示信息
4. IF 用户上传的文件大小超过系统配置的上限, THEN THE Platform SHALL 拒绝该文件并显示文件大小超限的提示信息
5. WHEN 文件上传成功, THE Platform SHALL 在资料列表中显示该文件的名称、上传时间和处理状态

### Requirement 2: 资料文本抽取

**User Story:** As a 学习者, I want 系统自动从上传的资料中提取文本内容, so that AI 可以理解资料内容并生成相关考题

#### Acceptance Criteria

1. WHEN 一个 PDF 文件上传成功, THE Document_Processor SHALL 从该 PDF 文件中抽取纯文本内容并存储到数据库中
2. WHEN 一个 Word 文件上传成功, THE Document_Processor SHALL 从该 Word 文件中抽取纯文本内容并存储到数据库中
3. WHILE 文本抽取正在进行, THE Platform SHALL 将该 Material 的状态显示为"处理中"
4. WHEN 文本抽取完成, THE Platform SHALL 将该 Material 的状态更新为"已就绪"
5. IF 文本抽取过程中发生错误, THEN THE Platform SHALL 将该 Material 的状态更新为"处理失败"并记录错误原因

### Requirement 3: AI 资料分析

**User Story:** As a 学习者, I want AI 自动分析资料的知识结构, so that 生成的考题能覆盖资料中的关键知识点

#### Acceptance Criteria

1. WHEN 用户对一份已就绪的 Material 触发"AI 分析"操作, THE AI_Service SHALL 将该 Material 的文本内容发送至 DeepSeek API 进行知识点提取
2. WHEN DeepSeek API 返回分析结果, THE AI_Service SHALL 将提取的知识点列表存储到该 Material 关联的数据库记录中
3. WHEN 资料分析完成, THE Platform SHALL 向用户展示该 Material 包含的知识点摘要
4. IF DeepSeek API 调用失败, THEN THE Platform SHALL 显示"AI 分析失败，请检查网络连接或 API 配置"的提示信息

### Requirement 4: AI 考题生成

**User Story:** As a 学习者, I want AI 基于资料内容自动生成多种题型的考题, so that 我可以通过做题检验学习效果

#### Acceptance Criteria

1. WHEN 用户选择一个或多个已分析的 Material 并触发"生成考题"操作, THE Question_Generator SHALL 调用 DeepSeek API 生成考题
2. THE Question_Generator SHALL 支持生成以下五种题型：单选题、多选题、判断题、填空题、简答题
3. WHEN 考题生成完成, THE Platform SHALL 将生成的 Question 存储到当前 Subject 的题库中
4. THE Question_Generator SHALL 为每道生成的 Question 提供题干、正确答案和答案解析
5. WHEN 生成单选题或多选题时, THE Question_Generator SHALL 为每道题提供不少于 4 个选项
6. WHEN 用户指定生成题目的数量和题型分布, THE Question_Generator SHALL 按照用户指定的参数生成考题
7. IF DeepSeek API 调用失败, THEN THE Platform SHALL 显示"考题生成失败，请稍后重试"的提示信息并保留用户已选择的参数

### Requirement 5: 答题系统

**User Story:** As a 学习者, I want 在线作答系统生成的考题, so that 我可以检验自己对知识点的掌握程度

#### Acceptance Criteria

1. WHEN 用户从题库中选择题目并开始答题, THE Platform SHALL 创建一个新的 Exam_Session 并按顺序展示题目
2. WHEN 展示单选题时, THE Frontend SHALL 提供单选按钮组供用户选择一个答案
3. WHEN 展示多选题时, THE Frontend SHALL 提供复选框组供用户选择多个答案
4. WHEN 展示判断题时, THE Frontend SHALL 提供"正确"和"错误"两个选项供用户选择
5. WHEN 展示填空题时, THE Frontend SHALL 提供文本输入框供用户填写答案
6. WHEN 展示简答题时, THE Frontend SHALL 提供多行文本输入区域供用户编写答案
7. WHEN 用户完成所有题目并提交答卷, THE Platform SHALL 记录用户的所有作答内容和提交时间
8. WHILE 用户正在答题, THE Platform SHALL 允许用户在已作答的题目之间自由切换

### Requirement 6: 自动判分

**User Story:** As a 学习者, I want 系统自动为我的答卷评分, so that 我可以立即了解自己的答题表现

#### Acceptance Criteria

1. WHEN 用户提交答卷, THE Scoring_Engine SHALL 对所有 Objective_Question（单选、多选、判断、填空）进行本地自动判分
2. WHEN 判定单选题和判断题时, THE Scoring_Engine SHALL 将用户答案与正确答案进行精确匹配，匹配则得满分，否则得零分
3. WHEN 判定多选题时, THE Scoring_Engine SHALL 将用户选择的选项集合与正确答案集合进行比较，完全一致得满分，否则得零分
4. WHEN 判定填空题时, THE Scoring_Engine SHALL 将用户答案与正确答案进行文本匹配（忽略首尾空格），匹配则得满分，否则得零分
5. WHEN 答卷中包含 Subjective_Question, THE Scoring_Engine SHALL 将简答题的题干、参考答案和用户作答发送至 DeepSeek API 进行评分
6. WHEN DeepSeek API 返回主观题评分结果, THE Scoring_Engine SHALL 记录评分分数和评分理由
7. WHEN 所有题目判分完成, THE Platform SHALL 向用户展示总分、各题得分和正确答案
8. IF 主观题 AI 评分调用失败, THEN THE Platform SHALL 完成客观题判分结果的展示，并将主观题标记为"待评分"状态

### Requirement 7: 考后 AI 分析

**User Story:** As a 学习者, I want 考后获得 AI 的分析报告和提升建议, so that 我可以有针对性地改进薄弱环节

#### Acceptance Criteria

1. WHEN 一次 Exam_Session 的判分全部完成, THE AI_Service SHALL 将答题数据（题目、用户作答、得分、知识点）发送至 DeepSeek API 生成分析报告
2. WHEN DeepSeek API 返回分析结果, THE Platform SHALL 向用户展示以下内容：薄弱知识点列表、错题原因分析、针对性提升建议
3. WHEN 分析报告生成完成, THE Platform SHALL 将该报告与对应的 Exam_Session 关联存储
4. IF DeepSeek API 分析调用失败, THEN THE Platform SHALL 显示"分析报告生成失败"的提示信息，并允许用户手动重新触发分析

### Requirement 8: 多学科管理

**User Story:** As a 学习者, I want 按学科独立管理资料、题库和答题记录, so that 不同学科的学习内容互不干扰

#### Acceptance Criteria

1. THE Platform SHALL 允许用户创建新的 Subject，每个 Subject 包含名称字段
2. THE Platform SHALL 在主界面提供 Subject 切换功能，用户可选择当前操作的学科
3. WHEN 用户切换到某个 Subject, THE Platform SHALL 仅展示该 Subject 下的资料、题库和答题记录
4. THE Platform SHALL 确保每个 Subject 的 Material、Question 和 Exam_Session 数据在存储层面相互隔离
5. WHEN 用户删除一个 Subject, THE Platform SHALL 同时删除该 Subject 下的所有关联数据（资料、题库、答题记录、分析报告）
6. WHEN 用户尝试删除 Subject 时, THE Platform SHALL 显示确认对话框，明确告知将删除的数据范围

### Requirement 9: 学习进度与趋势可视化

**User Story:** As a 学习者, I want 查看学习进度和成绩趋势图表, so that 我可以直观了解自己的学习状况和进步情况

#### Acceptance Criteria

1. THE Analytics_Engine SHALL 为每个 Subject 计算以下指标：已完成考试次数、平均得分率、各知识点掌握率
2. WHEN 用户进入学习进度页面, THE Platform SHALL 以图表形式展示当前 Subject 的得分趋势（横轴为考试时间，纵轴为得分率）
3. WHEN 用户进入学习进度页面, THE Platform SHALL 展示各知识点的掌握程度分布
4. WHEN 一次新的 Exam_Session 完成判分, THE Analytics_Engine SHALL 自动更新该 Subject 的进度统计数据
5. THE Platform SHALL 支持按时间范围筛选趋势数据（最近 7 天、30 天、全部）

### Requirement 10: 数据存储

**User Story:** As a 学习者, I want 所有学习数据保存在本地, so that 我的数据安全可控且无需依赖外部存储服务

#### Acceptance Criteria

1. THE Backend SHALL 使用 SQLite 作为本地数据存储引擎
2. THE Backend SHALL 将所有用户数据（资料元信息、题库、答题记录、分析报告、进度统计）持久化存储到本地 SQLite 数据库文件中
3. IF 数据库文件不存在, THEN THE Backend SHALL 在首次启动时自动创建数据库并初始化表结构
4. THE Backend SHALL 将上传的原始文件存储在本地文件系统的指定目录中

### Requirement 11: DeepSeek API 集成

**User Story:** As a 学习者, I want 配置 DeepSeek API 密钥, so that 系统可以调用 AI 服务完成智能功能

#### Acceptance Criteria

1. THE Platform SHALL 提供 API 配置界面，允许用户输入和保存 DeepSeek API 密钥
2. WHEN 用户保存 API 密钥, THE Backend SHALL 将密钥加密存储到本地配置中
3. WHEN 用户触发任何需要 AI 服务的操作且 API 密钥未配置, THE Platform SHALL 提示用户先完成 API 配置
4. THE Platform SHALL 提供 API 连接测试功能，验证密钥有效性并显示测试结果

### Requirement 12: 本地部署与访问

**User Story:** As a 学习者, I want 在本机启动应用并通过浏览器访问, so that 无需复杂的服务器部署即可使用

#### Acceptance Criteria

1. THE Backend SHALL 在本地启动 HTTP 服务，监听指定端口
2. WHEN Backend 服务启动成功, THE Platform SHALL 可通过浏览器访问 localhost 地址使用全部功能
3. THE Platform SHALL 为单用户设计，无需用户注册或登录流程
4. IF Backend 服务启动时指定端口被占用, THEN THE Backend SHALL 提示端口冲突信息并退出

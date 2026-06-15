/**
 * 学科背景图 CDN 资源
 * 使用 Unsplash 免费图片（无需 API Key）
 * 根据学科名称关键词匹配合适的背景图
 */

// 预定义的高质量学科背景图 (Unsplash CDN, 免费使用)
const SUBJECT_BACKGROUNDS: Record<string, string> = {
  // 理工科
  数学: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=200&fit=crop',
  物理: 'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=400&h=200&fit=crop',
  化学: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=400&h=200&fit=crop',
  生物: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=400&h=200&fit=crop',
  计算机: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=200&fit=crop',
  编程: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=200&fit=crop',
  软件: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=200&fit=crop',
  网络: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=200&fit=crop',
  人工智能: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=200&fit=crop',
  机器学习: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&h=200&fit=crop',
  电子: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=200&fit=crop',
  通信: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop',
  // 文科
  英语: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=400&h=200&fit=crop',
  语文: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=200&fit=crop',
  历史: 'https://images.unsplash.com/photo-1461360370896-922624d12a74?w=400&h=200&fit=crop',
  地理: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=400&h=200&fit=crop',
  政治: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=200&fit=crop',
  哲学: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=200&fit=crop',
  // 商科
  经济: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop',
  金融: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&h=200&fit=crop',
  管理: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=200&fit=crop',
  会计: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop',
  // 医学
  医学: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=200&fit=crop',
  护理: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=200&fit=crop',
  药学: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=200&fit=crop',
  // 考试
  软考: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=200&fit=crop',
  考研: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=200&fit=crop',
  公务员: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=200&fit=crop',
  教师: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=200&fit=crop',
  // 其他
  音乐: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=200&fit=crop',
  美术: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=200&fit=crop',
  体育: 'https://images.unsplash.com/photo-1461896836934-bd45f5db65c1?w=400&h=200&fit=crop',
  法律: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=200&fit=crop',
};

// 通用备选背景图（当学科名称无法匹配时使用）
const FALLBACK_BACKGROUNDS = [
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=200&fit=crop',
  'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&h=200&fit=crop',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=200&fit=crop',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=200&fit=crop',
];

/**
 * 根据学科名称获取背景图 URL
 * 优先精确匹配，其次模糊匹配关键词，最后使用备选图
 */
export function getSubjectBackground(subjectName: string, index: number): string {
  // 精确匹配
  if (SUBJECT_BACKGROUNDS[subjectName]) {
    return SUBJECT_BACKGROUNDS[subjectName];
  }

  // 模糊匹配：学科名包含关键词
  for (const [keyword, url] of Object.entries(SUBJECT_BACKGROUNDS)) {
    if (subjectName.includes(keyword) || keyword.includes(subjectName)) {
      return url;
    }
  }

  // 备选
  return FALLBACK_BACKGROUNDS[index % FALLBACK_BACKGROUNDS.length];
}

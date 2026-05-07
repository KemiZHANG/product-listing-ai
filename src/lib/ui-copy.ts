import type { UiLanguage } from './ui-language'

export function getAuthGateCopy(language: UiLanguage) {
  return {
    checkingAccess: language === 'en' ? 'Checking access...' : '正在检查访问权限...',
  }
}

export function getPaginationCopy(language: UiLanguage) {
  return {
    previous: language === 'en' ? 'Previous' : '上一页',
    next: language === 'en' ? 'Next' : '下一页',
    page: (page: number, totalPages: number) =>
      language === 'en' ? `Page ${page} / ${totalPages}` : `第 ${page} / ${totalPages} 页`,
  }
}

export function getNavbarCopy(language: UiLanguage) {
  return {
    dashboard: language === 'en' ? 'Dashboard' : '运营概览',
    products: language === 'en' ? 'Initial Products' : '初始商品',
    categories: language === 'en' ? 'Category Prompts' : '类目指令',
    productOutputs: language === 'en' ? 'Product Copy Outputs' : '商品副本输出',
    imageOutputs: language === 'en' ? 'Image Outputs' : '图片生成输出',
    seoKeywords: language === 'en' ? 'SEO Keywords' : 'SEO 关键词库',
    rules: language === 'en' ? 'Rules' : '规则模板',
    settings: language === 'en' ? 'Settings' : '系统设置',
    admin: language === 'en' ? 'Admin' : '员工授权',
    logout: language === 'en' ? 'Logout' : '退出',
  }
}

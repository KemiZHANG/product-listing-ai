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
    dashboard: language === 'en' ? 'Dashboard' : '概览',
    products: language === 'en' ? 'Products' : '商品',
    categories: language === 'en' ? 'Categories' : '类目',
    productOutputs: language === 'en' ? 'Product Outputs' : '副本输出',
    imageOutputs: language === 'en' ? 'Image Outputs' : '图片输出',
    seoKeywords: language === 'en' ? 'SEO Keywords' : 'SEO 关键词',
    rules: language === 'en' ? 'Rules' : '规则',
    settings: language === 'en' ? 'Settings' : '设置',
    admin: language === 'en' ? 'Admin' : '管理',
    logout: language === 'en' ? 'Logout' : '退出',
  }
}

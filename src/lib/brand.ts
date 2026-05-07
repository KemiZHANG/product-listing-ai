import { getAppEdition, type AppEdition } from './app-edition'

export type BrandConfig = {
  edition: AppEdition
  appName: string
  shortName: string
  shortDescription: string
  loginTitle: string
  loginSubtitle: string
  heroEyebrow: string
  heroTitle: string
  heroDescription: string
  demoTitle: string
  demoDescription: string
  demoBullets: string[]
}

function buildBrandConfig(edition: AppEdition): BrandConfig {
  if (edition === 'resume') {
    return {
      edition,
      appName: 'Product Listing AI',
      shortName: 'PL',
      shortDescription: 'AI-powered ecommerce listing workspace for product copy, images, SEO, and rules.',
      loginTitle: 'Product Listing AI',
      loginSubtitle: 'Product Listing AI',
      heroEyebrow: 'Product Listing AI',
      heroTitle: 'Product Listing AI',
      heroDescription: 'Create products, generate copy and images, and manage listing workflows in one place.',
      demoTitle: '',
      demoDescription: '',
      demoBullets: [],
    }
  }

  return {
    edition,
    appName: 'DLM AI',
    shortName: 'DLM',
    shortDescription: 'AI-powered ecommerce listing workspace for product copy, images, SEO, and rules.',
    loginTitle: 'DLM AI',
    loginSubtitle: 'DLM AI',
    heroEyebrow: 'DLM AI',
    heroTitle: 'DLM AI',
    heroDescription: 'Manage SKUs, reference images, prompts, multilingual copies, and review work in one workflow.',
    demoTitle: '',
    demoDescription: '',
    demoBullets: [],
  }
}

export function getBrandConfig(): BrandConfig {
  return buildBrandConfig(getAppEdition())
}

export function getClientBrandConfig(): BrandConfig {
  const edition = process.env.NEXT_PUBLIC_APP_EDITION === 'resume' ? 'resume' : 'company'
  return buildBrandConfig(edition)
}

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
      loginSubtitle: 'Public demo edition for portfolio review',
      heroEyebrow: 'Listing content studio',
      heroTitle: 'Public listing workflow demo',
      heroDescription: 'Create products, manage prompts, generate copy and images, and review outputs in an isolated demo workspace.',
      demoTitle: 'Public demo edition',
      demoDescription: 'Any email can register here. AI generation still requires the built-in password or your own API keys, and all demo data stays separate from the company workspace.',
      demoBullets: [
        'Open registration for HR and external reviewers',
        'AI features still require the built-in password or your own API keys',
        'Data is isolated from the internal company deployment',
      ],
    }
  }

  return {
    edition,
    appName: 'Product Listing AI',
    shortName: 'PL',
    shortDescription: 'AI-powered ecommerce listing workspace for product copy, images, SEO, and rules.',
    loginTitle: 'Product Listing AI',
    loginSubtitle: 'Internal listing workspace',
    heroEyebrow: 'Internal listing workspace',
    heroTitle: 'Team listing operations hub',
    heroDescription: 'Manage SKUs, reference images, prompts, multilingual copies, and review work in one internal workflow.',
    demoTitle: 'Authorized internal edition',
    demoDescription: 'Only approved company emails can register, sign in, and use the built-in AI workflow.',
    demoBullets: [
      'Authorization-based access for company staff',
      'Built-in AI access can be revoked immediately',
      'Internal data stays in the company workspace',
    ],
  }
}

export function getBrandConfig(): BrandConfig {
  return buildBrandConfig(getAppEdition())
}

export function getClientBrandConfig(): BrandConfig {
  const edition = process.env.NEXT_PUBLIC_APP_EDITION === 'resume' ? 'resume' : 'company'
  return buildBrandConfig(edition)
}

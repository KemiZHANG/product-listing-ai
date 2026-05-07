'use client'

import { getClientBrandConfig } from '@/lib/brand'

export default function BrandMark({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg'
}) {
  const brand = getClientBrandConfig()
  const sizeClasses = size === 'sm'
    ? 'h-9 w-9 text-sm'
    : size === 'lg'
      ? 'h-20 w-20 text-2xl'
      : 'h-10 w-10 text-base'

  return (
    <span className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0f172a,#2563eb)] font-semibold tracking-wide text-white shadow-[0_14px_36px_rgba(15,23,42,0.18)] ${sizeClasses}`}>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_42%)]" />
      <span className="relative">{brand.shortName}</span>
    </span>
  )
}

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
    <span className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#07111f_0%,#1640a8_58%,#155eef_100%)] font-semibold tracking-wide text-white shadow-[0_12px_28px_rgba(21,94,239,0.22),0_0_0_1px_rgba(255,255,255,0.42)_inset] ${sizeClasses}`}>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.3),transparent_42%)]" />
      <span className="relative">{brand.shortName}</span>
    </span>
  )
}

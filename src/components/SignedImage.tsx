'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'

type SignedImageProps = {
  src?: string | null
  alt: string
  className?: string
  sizes?: string
  width?: number
  height?: number
  fill?: boolean
  emptyFallback?: ReactNode
}

export default function SignedImage({
  src,
  alt,
  className,
  sizes = '100vw',
  width = 1200,
  height = 1200,
  fill = false,
  emptyFallback = null,
}: SignedImageProps) {
  if (!src) {
    return <>{emptyFallback}</>
  }

  if (fill) {
    return <Image src={src} alt={alt} fill unoptimized sizes={sizes} className={className} />
  }

  return <Image src={src} alt={alt} width={width} height={height} unoptimized sizes={sizes} className={className} />
}

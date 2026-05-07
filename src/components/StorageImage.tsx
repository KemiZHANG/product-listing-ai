'use client'

import { useCallback, useEffect, useState } from 'react'
import SignedImage from '@/components/SignedImage'
import { signStorageUrl } from '@/lib/signed-storage'

type StorageImageProps = {
  bucket: 'images' | 'outputs'
  storagePath?: string | null
  alt: string
  className?: string
  sizes?: string
  width?: number
  height?: number
  fill?: boolean
  initialSrc?: string | null
  emptyFallback?: React.ReactNode
}

export default function StorageImage({
  bucket,
  storagePath,
  alt,
  className,
  sizes,
  width,
  height,
  fill,
  initialSrc = null,
  emptyFallback = null,
}: StorageImageProps) {
  const [src, setSrc] = useState<string | null>(initialSrc)
  const [refreshAttempted, setRefreshAttempted] = useState(false)

  const loadSignedUrl = useCallback(async (force = false) => {
    if (!storagePath) {
      setSrc(null)
      return
    }

    try {
      const nextUrl = await signStorageUrl(bucket, storagePath, { force })
      setSrc(nextUrl)
    } catch {
      if (force) {
        setSrc(null)
      }
    }
  }, [bucket, storagePath])

  useEffect(() => {
    setSrc(initialSrc || null)
    setRefreshAttempted(false)
  }, [initialSrc, storagePath])

  useEffect(() => {
    if (!src && storagePath) {
      void loadSignedUrl(false)
    }
  }, [loadSignedUrl, src, storagePath])

  const handleError = useCallback(() => {
    if (refreshAttempted || !storagePath) {
      setSrc(null)
      return
    }

    setRefreshAttempted(true)
    void loadSignedUrl(true)
  }, [loadSignedUrl, refreshAttempted, storagePath])

  return (
    <SignedImage
      src={src}
      alt={alt}
      className={className}
      sizes={sizes}
      width={width}
      height={height}
      fill={fill}
      emptyFallback={emptyFallback}
      onError={handleError}
    />
  )
}

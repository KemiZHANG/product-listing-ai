import { apiFetch } from './api'

type StorageBucket = 'images' | 'outputs'

type SignedUrlCacheEntry = {
  url: string
  expiresAt: number
}

const SIGNED_URL_TTL_MS = 55 * 60 * 1000
const MAX_PATHS_PER_REQUEST = 60
const signedUrlCache = new Map<string, SignedUrlCacheEntry>()

function cacheKey(bucket: StorageBucket, path: string) {
  return `${bucket}:${path}`
}

function getCachedSignedUrl(bucket: StorageBucket, path: string) {
  const entry = signedUrlCache.get(cacheKey(bucket, path))
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    signedUrlCache.delete(cacheKey(bucket, path))
    return null
  }

  return entry.url
}

function setCachedSignedUrl(bucket: StorageBucket, path: string, url: string) {
  if (!url) return
  signedUrlCache.set(cacheKey(bucket, path), {
    url,
    expiresAt: Date.now() + SIGNED_URL_TTL_MS,
  })
}

function splitIntoChunks<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function signStorageUrls(
  bucket: StorageBucket,
  paths: string[],
  options: { force?: boolean } = {}
) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  if (uniquePaths.length === 0) return {}

  const force = options.force === true
  const urls: Record<string, string> = {}
  const missingPaths: string[] = []

  for (const path of uniquePaths) {
    const cached = force ? null : getCachedSignedUrl(bucket, path)
    if (cached) {
      urls[path] = cached
    } else {
      missingPaths.push(path)
    }
  }

  for (const chunk of splitIntoChunks(missingPaths, MAX_PATHS_PER_REQUEST)) {
    const res = await apiFetch('/api/storage/signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, paths: chunk }),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      const fallbackUrls = Object.fromEntries(
        chunk
          .map((path) => [path, getCachedSignedUrl(bucket, path)])
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      )
      if (Object.keys(fallbackUrls).length === chunk.length) {
        Object.assign(urls, fallbackUrls)
        continue
      }

      throw new Error(data?.error || 'Storage signed URL generation failed')
    }

    const chunkUrls = (data?.urls || {}) as Record<string, string>
    for (const [path, url] of Object.entries(chunkUrls)) {
      if (!url) continue
      urls[path] = url
      setCachedSignedUrl(bucket, path, url)
    }
  }

  return urls
}

export async function signStorageUrl(
  bucket: StorageBucket,
  path: string | null | undefined,
  options: { force?: boolean } = {}
) {
  if (!path) return null
  const urls = await signStorageUrls(bucket, [path], options)
  return urls[path] || null
}

import { cleanEnvSecret } from './gemini-settings'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
const OPENAI_BATCH_PREFIX = '__OPENAI_BATCH__'

export type OpenAIBatchMeta = {
  kind: 'openai_batch'
  batchId: string
  inputFileId: string
  createdAt: string
}

type OpenAIBatch = {
  id: string
  status: string
  output_file_id?: string | null
  error_file_id?: string | null
  errors?: unknown
}

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string
    b64Json?: string
  }>
  error?: {
    message?: string
  }
}

export function readOpenAIImageApiKey() {
  return cleanEnvSecret(process.env.OPENAI_API_KEY)
}

export function getOpenAIImageModel() {
  return cleanEnvSecret(process.env.OPENAI_IMAGE_MODEL) || 'gpt-image-2'
}

export function isValidOpenAIApiKey(apiKey: string | null | undefined) {
  return typeof apiKey === 'string' && apiKey.startsWith('sk-') && apiKey.length >= 30
}

export function encodeOpenAIBatchMeta(meta: OpenAIBatchMeta) {
  return `${OPENAI_BATCH_PREFIX}${JSON.stringify(meta)}`
}

export function decodeOpenAIBatchMeta(value: string | null | undefined): OpenAIBatchMeta | null {
  if (!value?.startsWith(OPENAI_BATCH_PREFIX)) return null
  try {
    return JSON.parse(value.slice(OPENAI_BATCH_PREFIX.length)) as OpenAIBatchMeta
  } catch {
    return null
  }
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
  }
}

async function parseOpenAIResponse(response: Response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text } }
  }
}

function extractErrorMessage(data: unknown) {
  const error = (data as { error?: { message?: string } | string })?.error
  if (!error) return null
  return typeof error === 'string' ? error : error.message || JSON.stringify(error)
}

export function extractOpenAIImageBase64(data: unknown) {
  return (data as OpenAIImageResponse)?.data?.[0]?.b64_json || (data as OpenAIImageResponse)?.data?.[0]?.b64Json || null
}

export async function editOpenAIImageDirect(
  apiKey: string,
  prompt: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string
) {
  const form = new FormData()
  form.append('model', getOpenAIImageModel())
  form.append('prompt', prompt)
  form.append('n', '1')
  form.append('output_format', 'png')
  form.append('image[]', new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), filename)

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: form,
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI GPT Image 2 direct error ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }

  return extractOpenAIImageBase64(data)
}

export async function uploadOpenAIVisionFile(apiKey: string, imageBuffer: Buffer, mimeType: string, filename: string) {
  const form = new FormData()
  form.append('purpose', 'vision')
  form.append('file', new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), filename)

  const response = await fetch(`${OPENAI_API_BASE}/files`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: form,
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI vision file upload failed ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }

  const fileId = (data as { id?: string })?.id
  if (!fileId) {
    throw new Error('OpenAI vision file upload did not return a file id')
  }

  return fileId
}

export async function uploadOpenAIBatchInputFile(apiKey: string, jsonl: string, filename: string) {
  const form = new FormData()
  form.append('purpose', 'batch')
  form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), filename)

  const response = await fetch(`${OPENAI_API_BASE}/files`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: form,
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI batch input upload failed ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }

  const fileId = (data as { id?: string })?.id
  if (!fileId) {
    throw new Error('OpenAI batch input upload did not return a file id')
  }

  return fileId
}

export async function createOpenAIBatch(apiKey: string, inputFileId: string, description: string) {
  const response = await fetch(`${OPENAI_API_BASE}/batches`, {
    method: 'POST',
    headers: {
      ...authHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: '/v1/images/edits',
      completion_window: '24h',
      metadata: { description },
    }),
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI batch create failed ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }

  const batchId = (data as { id?: string })?.id
  if (!batchId) {
    throw new Error('OpenAI batch create did not return a batch id')
  }

  return batchId
}

export async function getOpenAIBatch(apiKey: string, batchId: string): Promise<OpenAIBatch> {
  const response = await fetch(`${OPENAI_API_BASE}/batches/${batchId}`, {
    headers: {
      ...authHeaders(apiKey),
      'Content-Type': 'application/json',
    },
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI batch status failed ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }

  return data as OpenAIBatch
}

export async function cancelOpenAIBatch(apiKey: string, batchId: string) {
  const response = await fetch(`${OPENAI_API_BASE}/batches/${batchId}/cancel`, {
    method: 'POST',
    headers: {
      ...authHeaders(apiKey),
      'Content-Type': 'application/json',
    },
  })
  const data = await parseOpenAIResponse(response)

  if (!response.ok) {
    throw new Error(`OpenAI batch cancel failed ${response.status}: ${extractErrorMessage(data) || JSON.stringify(data)}`)
  }
}

export async function downloadOpenAIFileContent(apiKey: string, fileId: string) {
  const response = await fetch(`${OPENAI_API_BASE}/files/${fileId}/content`, {
    headers: authHeaders(apiKey),
  })

  if (!response.ok) {
    throw new Error(`OpenAI file download failed ${response.status}: ${await response.text()}`)
  }

  return response.text()
}

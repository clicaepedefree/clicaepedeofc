import { addStoreFile } from '@/features/store/api'
import { validateUserPermissionsForStore } from '@/features/store/api'

export const STORE_FILES_BUCKET = 'store-files'
export const MAX_IMAGE_UPLOAD_SIZE = 4 * 1024 * 1024

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export type UploadedStoreFile = {
  id: number
  url: string
}

export function assertValidImageFile(file: File) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error('Formato de imagem nao suportado')
  }

  if (file.size > MAX_IMAGE_UPLOAD_SIZE) {
    throw new Error('Arquivo muito grande')
  }
}

function getSupabaseStorageConfig() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Storage nao configurado')
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
  }
}

function getFileExtension(file: File) {
  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }

  return extensionByMimeType[file.type] ?? 'bin'
}

function buildStorageObjectPath(storeId: number, file: File) {
  const extension = getFileExtension(file)
  const randomId = crypto.randomUUID()

  return `stores/${storeId}/${randomId}.${extension}`
}

async function deleteStorageObject({
  supabaseUrl,
  serviceRoleKey,
  objectPath,
}: {
  supabaseUrl: string
  serviceRoleKey: string
  objectPath: string
}) {
  await fetch(`${supabaseUrl}/storage/v1/object/${STORE_FILES_BUCKET}/${objectPath}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })
}

export async function uploadStoreImageFile({
  file,
  storeId,
  tag,
}: {
  file: File
  storeId: number
  tag?: string
}): Promise<UploadedStoreFile> {
  assertValidImageFile(file)

  const { user } = await validateUserPermissionsForStore(storeId, 'admin')
  const { supabaseUrl, serviceRoleKey } = getSupabaseStorageConfig()
  const objectPath = buildStorageObjectPath(storeId, file)

  const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/${STORE_FILES_BUCKET}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': file.type,
        'Cache-Control': '3600',
        'x-upsert': 'false',
      },
      body: file,
    }
  )

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`Erro ao enviar arquivo para o Supabase Storage: ${errorText}`)
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORE_FILES_BUCKET}/${objectPath}`
  let createdFile: Awaited<ReturnType<typeof addStoreFile>>

  try {
    createdFile = await addStoreFile({
      storeId,
      creatorId: user.id,
      provider: 'supabase-storage',
      type: file.type,
      url: publicUrl,
      tag,
    })
  } catch (error) {
    await deleteStorageObject({ supabaseUrl, serviceRoleKey, objectPath })
    throw error
  }

  return {
    id: createdFile.id,
    url: createdFile.url,
  }
}

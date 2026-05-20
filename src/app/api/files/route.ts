import { uploadStoreImageFile } from '@/services/files-manager'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UploadInputSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  tag: z.string().trim().max(64).optional(),
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Arquivo nao informado' },
        { status: 400 }
      )
    }

    const input = UploadInputSchema.parse({
      storeId: formData.get('storeId'),
      tag: formData.get('tag') || undefined,
    })

    const serverData = await uploadStoreImageFile({
      file,
      storeId: input.storeId,
      tag: input.tag,
    })

    return NextResponse.json({ serverData })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao fazer upload do arquivo'

    return NextResponse.json({ error: message }, { status: 400 })
  }
}

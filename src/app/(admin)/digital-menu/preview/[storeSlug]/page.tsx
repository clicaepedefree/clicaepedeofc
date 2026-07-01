import { getDigitalMenuPreviewBySlug } from '@/features/digital-menu/api'
import { DigitalMenuClient } from '@/features/digital-menu/components/digital-menu-client'
import { Eye } from 'lucide-react'
import { notFound } from 'next/navigation'

type PageProps = {
  params: Promise<{ storeSlug: string }>
}

export default async function DigitalMenuPreviewPage({ params }: PageProps) {
  const { storeSlug } = await params
  const menu = await getDigitalMenuPreviewBySlug(storeSlug)
  if (!menu) notFound()

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-800 backdrop-blur dark:text-amber-200">
        <Eye className="size-4" />
        Modo previa: navegacao liberada, envio de pedidos desativado.
      </div>
      {menu.categories.length > 0 ? (
        <DigitalMenuClient menu={menu} previewMode />
      ) : (
        <div className="mx-auto flex min-h-[60dvh] max-w-lg items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Adicione ao menos um produto disponivel para visualizar a vitrine.
        </div>
      )}
    </div>
  )
}

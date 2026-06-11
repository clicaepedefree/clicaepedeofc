import { getDigitalMenuBySlug } from '@/features/digital-menu/api'
import { DigitalMenuClient } from '@/features/digital-menu/components/digital-menu-client'
import { Store, TriangleAlert } from 'lucide-react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

type PageProps = {
  params: Promise<{ storeSlug: string }>
}

export const generateMetadata = async ({
  params,
}: PageProps): Promise<Metadata> => {
  const { storeSlug } = await params
  const menu = await getDigitalMenuBySlug(storeSlug)

  if (!menu) {
    return {
      title: 'Cardapio indisponivel | Clica e Pede',
    }
  }

  return {
    title: `${menu.store.name} | Cardapio digital`,
    description: `Faca seu pedido no cardapio digital da loja ${menu.store.name}.`,
  }
}

export default async function DigitalMenuPage({ params }: PageProps) {
  const { storeSlug } = await params
  const menu = await getDigitalMenuBySlug(storeSlug)

  if (!menu) notFound()

  if (menu.unavailableReason) {
    return (
      <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
        <section className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-lg border bg-card text-primary">
            <TriangleAlert className="size-7" />
          </div>
          <p className="mb-2 text-sm font-medium text-primary">Cardapio digital</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {menu.store.name} nao esta recebendo pedidos agora.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {menu.unavailableReason}
          </p>
        </section>
      </main>
    )
  }

  if (menu.categories.length === 0) {
    return (
      <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
        <section className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-lg border bg-card text-primary">
            <Store className="size-7" />
          </div>
          <p className="mb-2 text-sm font-medium text-primary">Cardapio digital</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cardapio em preparacao
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A loja ainda nao possui itens disponiveis para pedidos pelo cardapio
            digital.
          </p>
        </section>
      </main>
    )
  }

  return <DigitalMenuClient menu={menu} />
}

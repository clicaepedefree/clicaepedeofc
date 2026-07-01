import { PublicOrderTracking } from '@/features/digital-menu/components/public-order-tracking'
import type { Metadata } from 'next'

type PageProps = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: 'Acompanhar pedido | Clica e Pede',
  description: 'Acompanhe o andamento do seu pedido.',
  robots: { index: false, follow: false },
}

export default async function PublicOrderTrackingPage({ params }: PageProps) {
  const { token } = await params
  return <PublicOrderTracking token={token} />
}

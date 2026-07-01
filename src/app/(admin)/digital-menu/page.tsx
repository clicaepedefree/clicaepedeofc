'use client'

import { DigitalMenuAdmin } from '@/features/digital-menu/components/digital-menu-admin'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'

export default function DigitalMenuAdminPage() {
  return (
    <>
      <PageHeaderBlock
        title="Cardapio Digital"
        subtitle="Publique sua vitrine e confira o que esta pronto para seus clientes."
      />
      <DigitalMenuAdmin />
    </>
  )
}

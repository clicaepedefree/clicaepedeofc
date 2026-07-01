export type DigitalMenuPublicationStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED'

export type DigitalMenuReadinessInput = {
  availableProducts: number
  activeBusinessHours: number
  activePaymentMethods: number
  activeDeliveryZones: number
  allowsTakeout: boolean
  hasPublicIdentity: boolean
}

export type DigitalMenuReadinessItem = {
  id: 'identity' | 'products' | 'hours' | 'fulfillment' | 'payments'
  label: string
  description: string
  ready: boolean
  blocking: boolean
  href: string
  actionLabel: string
}

export const deriveDigitalMenuPublicationStatus = ({
  publicationStatus,
  isDigitalMenuEnabled,
  isAcceptingOrders,
  operationalStatus,
}: {
  publicationStatus?: DigitalMenuPublicationStatus | null
  isDigitalMenuEnabled: boolean
  isAcceptingOrders: boolean
  operationalStatus: string
}): DigitalMenuPublicationStatus => {
  if (publicationStatus) return publicationStatus
  if (!isDigitalMenuEnabled) return 'DRAFT'
  if (!isAcceptingOrders || operationalStatus === 'PAUSED') return 'PAUSED'
  return 'PUBLISHED'
}

export const buildDigitalMenuReadiness = (
  input: DigitalMenuReadinessInput
): DigitalMenuReadinessItem[] => [
  {
    id: 'identity',
    label: 'Identidade da vitrine',
    description: input.hasPublicIdentity
      ? 'A vitrine possui imagem ou contato publico.'
      : 'Adicione logo, banner ou WhatsApp para dar identidade ao cardapio.',
    ready: input.hasPublicIdentity,
    blocking: false,
    href: '/settings/store#digital-menu-identity',
    actionLabel: 'Personalizar',
  },
  {
    id: 'products',
    label: 'Produtos disponiveis',
    description:
      input.availableProducts > 0
        ? `${input.availableProducts} produto(s) pronto(s) para a vitrine.`
        : 'Cadastre ao menos um produto disponivel para venda.',
    ready: input.availableProducts > 0,
    blocking: true,
    href: '/menu',
    actionLabel: 'Gerenciar produtos',
  },
  {
    id: 'hours',
    label: 'Horarios de atendimento',
    description:
      input.activeBusinessHours > 0
        ? `${input.activeBusinessHours} faixa(s) de horario ativa(s).`
        : 'Defina quando a loja atende pedidos digitais.',
    ready: input.activeBusinessHours > 0,
    blocking: true,
    href: '/settings/store#digital-menu-hours',
    actionLabel: 'Configurar horarios',
  },
  {
    id: 'fulfillment',
    label: 'Forma de atendimento',
    description:
      input.allowsTakeout || input.activeDeliveryZones > 0
        ? 'Retirada ou delivery esta disponivel para o cliente.'
        : 'Ative retirada ou cadastre uma regiao de entrega.',
    ready: input.allowsTakeout || input.activeDeliveryZones > 0,
    blocking: true,
    href: '/settings/store#digital-menu-delivery',
    actionLabel: 'Configurar atendimento',
  },
  {
    id: 'payments',
    label: 'Formas de pagamento',
    description:
      input.activePaymentMethods > 0
        ? `${input.activePaymentMethods} forma(s) de pagamento ativa(s).`
        : 'Ative ao menos uma forma de pagamento.',
    ready: input.activePaymentMethods > 0,
    blocking: true,
    href: '/settings/store#digital-menu-payments',
    actionLabel: 'Configurar pagamentos',
  },
]

export const canPublishDigitalMenu = (items: DigitalMenuReadinessItem[]) =>
  items.every(item => !item.blocking || item.ready)

export const buildDigitalMenuPath = (storeSlug: string) =>
  `/cardapio/${encodeURIComponent(storeSlug)}`

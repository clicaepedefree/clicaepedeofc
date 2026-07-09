export type PublicOrderKind = 'DELIVERY' | 'TAKEOUT' | string | undefined

export type PublicOrderStatusCopy = {
  title: string
  deliveryTitle?: string
  takeoutTitle?: string
  delivery: string
  takeout: string
}

export const publicOrderStatusCopy: Record<string, PublicOrderStatusCopy> = {
  RECEIVED: {
    title: 'Pedido recebido',
    delivery: 'Recebemos seu pedido e avisamos a loja.',
    takeout: 'Recebemos seu pedido e avisamos a loja.',
  },
  PENDING: {
    title: 'Aguardando confirmacao',
    delivery:
      'A loja vai confirmar se consegue preparar e entregar seu pedido.',
    takeout:
      'A loja vai confirmar se consegue preparar seu pedido para retirada.',
  },
  CREATED: {
    title: 'Aguardando confirmacao',
    delivery:
      'A loja vai confirmar se consegue preparar e entregar seu pedido.',
    takeout:
      'A loja vai confirmar se consegue preparar seu pedido para retirada.',
  },
  SENT_TO_STORE: {
    title: 'Enviado para a loja',
    delivery: 'Seu pedido ja esta disponivel para a equipe da loja.',
    takeout: 'Seu pedido ja esta disponivel para a equipe da loja.',
  },
  ACCEPTED: {
    title: 'Pedido aceito',
    delivery: 'A loja confirmou seu pedido e vai iniciar o preparo.',
    takeout: 'A loja confirmou seu pedido e vai iniciar o preparo.',
  },
  IN_PREPARATION: {
    title: 'Em preparo',
    delivery: 'Seu pedido esta sendo preparado para entrega.',
    takeout: 'Seu pedido esta sendo preparado para retirada.',
  },
  READY: {
    title: 'Pronto para retirada',
    deliveryTitle: 'Pronto para entrega',
    delivery: 'Seu pedido esta pronto para sair para entrega.',
    takeout: 'Seu pedido esta pronto para retirada no balcao.',
  },
  OUT_FOR_DELIVERY: {
    title: 'Saiu para entrega',
    delivery: 'Seu pedido saiu da loja e esta a caminho.',
    takeout: 'Seu pedido esta pronto para retirada.',
  },
  COMPLETED: {
    title: 'Pedido finalizado',
    delivery: 'Tudo certo com este pedido. Obrigado por comprar com a loja.',
    takeout: 'Tudo certo com este pedido. Obrigado por comprar com a loja.',
  },
  REJECTED: {
    title: 'Pedido nao aceito',
    delivery:
      'A loja nao conseguiu atender este pedido. Se ja combinou pagamento, fale com a loja.',
    takeout:
      'A loja nao conseguiu atender este pedido. Se ja combinou pagamento, fale com a loja.',
  },
  CANCELLED: {
    title: 'Pedido cancelado',
    delivery:
      'Este pedido foi cancelado. Se precisar, entre em contato com a loja.',
    takeout:
      'Este pedido foi cancelado. Se precisar, entre em contato com a loja.',
  },
}

export const deliveryProgressStatuses = [
  'RECEIVED',
  'PENDING',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
]

export const takeoutProgressStatuses = [
  'RECEIVED',
  'PENDING',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
  'COMPLETED',
]

export const publicStageStatus = (status: string) =>
  ['PENDING', 'CREATED', 'SENT_TO_STORE'].includes(status) ? 'PENDING' : status

export const getPublicOrderProgressStatuses = (orderType: PublicOrderKind) =>
  orderType === 'TAKEOUT' ? takeoutProgressStatuses : deliveryProgressStatuses

export const getPublicOrderStatusCopy = (
  status: string,
  orderType: PublicOrderKind
) => {
  const copy =
    publicOrderStatusCopy[publicStageStatus(status)] ??
    publicOrderStatusCopy.RECEIVED
  return {
    title:
      orderType === 'TAKEOUT'
        ? (copy.takeoutTitle ?? copy.title)
        : (copy.deliveryTitle ?? copy.title),
    message: orderType === 'TAKEOUT' ? copy.takeout : copy.delivery,
  }
}

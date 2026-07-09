export type StoreOrderNotification = {
  id: number
  displayId: string | number
  customerName?: string | null
  type?: string | null
  totalPrice?: number | string | null
}

export type BrowserNotificationPermission =
  | NotificationPermission
  | 'unsupported'

export const buildNewOrderNotification = (order: StoreOrderNotification) => {
  const customer = order.customerName?.trim() || 'Cliente nao informado'
  const orderType = order.type === 'TAKEOUT' ? 'Retirada' : 'Entrega'
  const total =
    order.totalPrice === null || order.totalPrice === undefined
      ? null
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(Number(order.totalPrice))

  return {
    title: `Novo pedido digital #${order.displayId}`,
    body: [customer, orderType, total].filter(Boolean).join(' - '),
    tag: `digital-order-${order.id}`,
  }
}

export const getBrowserNotificationPermission =
  (): BrowserNotificationPermission => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported'
    }

    return window.Notification.permission
  }

export const requestBrowserNotificationPermission =
  async (): Promise<BrowserNotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported'
    }

    return window.Notification.requestPermission()
  }

export const showNewOrderBrowserNotification = (
  order: StoreOrderNotification
) => {
  if (getBrowserNotificationPermission() !== 'granted') return false

  const notification = buildNewOrderNotification(order)
  new window.Notification(notification.title, {
    body: notification.body,
    tag: notification.tag,
    icon: '/clica-pedidos.png',
  })
  return true
}

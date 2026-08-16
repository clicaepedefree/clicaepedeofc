import type {
  StoreImplementationChecklistItem,
  StoreImplementationChecklistItemKey,
} from '@/services/db/schema'

export type StoreImplementationChecklistDefinition = {
  key: StoreImplementationChecklistItemKey
  title: string
  requiredForActivation: boolean
}

export const storeImplementationChecklistDefinitions: StoreImplementationChecklistDefinition[] =
  [
    {
      key: 'menu',
      title: 'Cardapio criado e revisado',
      requiredForActivation: true,
    },
    {
      key: 'integrations',
      title: 'Integracoes configuradas ou registradas como pendentes',
      requiredForActivation: true,
    },
    {
      key: 'payments',
      title: 'Pagamentos configurados e validados',
      requiredForActivation: true,
    },
    {
      key: 'test_order',
      title: 'Pedido teste realizado com sucesso',
      requiredForActivation: true,
    },
    {
      key: 'training',
      title: 'Treinamento inicial concluido com o cliente',
      requiredForActivation: true,
    },
  ]

export type StoreImplementationChecklistProgress = {
  total: number
  completed: number
  requiredTotal: number
  requiredCompleted: number
  percent: number
  canActivate: boolean
}

export function getStoreImplementationChecklistProgress(
  items: Array<
    Pick<StoreImplementationChecklistItem, 'status' | 'requiredForActivation'>
  >
): StoreImplementationChecklistProgress {
  const total = items.length
  const completed = items.filter(item => item.status === 'completed').length
  const requiredItems = items.filter(item => item.requiredForActivation)
  const requiredCompleted = requiredItems.filter(
    item => item.status === 'completed'
  ).length

  return {
    total,
    completed,
    requiredTotal: requiredItems.length,
    requiredCompleted,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    canActivate:
      requiredItems.length > 0 && requiredCompleted === requiredItems.length,
  }
}

export function isStoreImplementationChecklistItemKey(
  value: unknown
): value is StoreImplementationChecklistItemKey {
  return (
    typeof value === 'string' &&
    storeImplementationChecklistDefinitions.some(
      definition => definition.key === value
    )
  )
}

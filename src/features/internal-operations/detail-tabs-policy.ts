import {
  canUseInternalPermission,
  type InternalPermission,
  type InternalRole,
} from './access'

export const internalStoreDetailTabs = [
  'dados',
  'faturas',
  'plano',
  'modulos',
  'metricas',
  'usuarios',
  'historico',
] as const

export type InternalStoreDetailTab = (typeof internalStoreDetailTabs)[number]

export type InternalStoreDetailTabDefinition = {
  value: InternalStoreDetailTab
  label: string
  description: string
  requiredPermissions: InternalPermission[]
}

export const internalStoreDetailTabDefinitions: InternalStoreDetailTabDefinition[] =
  [
    {
      value: 'dados',
      label: 'Dados',
      description: 'Cadastro, responsavel e endereco da loja.',
      requiredPermissions: ['view_internal_operations'],
    },
    {
      value: 'faturas',
      label: 'Faturas',
      description: 'Resumo financeiro e ultimas cobrancas.',
      requiredPermissions: ['manage_billing_invoices'],
    },
    {
      value: 'plano',
      label: 'Plano',
      description: 'Assinatura, valor contratado e periodo vigente.',
      requiredPermissions: ['manage_billing_values'],
    },
    {
      value: 'modulos',
      label: 'Modulos',
      description: 'Modulos liberados por plano, adicional ou cortesia.',
      requiredPermissions: ['manage_store_modules'],
    },
    {
      value: 'metricas',
      label: 'Metricas',
      description: 'Indicadores operacionais da loja.',
      requiredPermissions: ['view_internal_operations'],
    },
    {
      value: 'usuarios',
      label: 'Usuarios',
      description: 'Administradores, acessos ativos e revogados.',
      requiredPermissions: ['reactivate_store'],
    },
    {
      value: 'historico',
      label: 'Historico',
      description: 'Auditoria interna e eventos financeiros recentes.',
      requiredPermissions: ['view_internal_operations'],
    },
  ]

export function parseInternalStoreDetailTab(
  value: unknown
): InternalStoreDetailTab | undefined {
  if (typeof value !== 'string') return undefined
  if (!internalStoreDetailTabs.includes(value as InternalStoreDetailTab)) {
    return undefined
  }

  return value as InternalStoreDetailTab
}

export function canViewInternalStoreDetailTab({
  role,
  tab,
}: {
  role: InternalRole
  tab: InternalStoreDetailTab
}) {
  const definition = internalStoreDetailTabDefinitions.find(
    candidate => candidate.value === tab
  )
  if (!definition) return false

  return definition.requiredPermissions.every(permission =>
    canUseInternalPermission({ currentRole: role, permission })
  )
}

export function getVisibleInternalStoreDetailTabs(role: InternalRole) {
  return internalStoreDetailTabDefinitions.filter(definition =>
    canViewInternalStoreDetailTab({ role, tab: definition.value })
  )
}

export function resolveInternalStoreDetailTab({
  requestedTab,
  role,
}: {
  requestedTab: unknown
  role: InternalRole
}) {
  const visibleTabs = getVisibleInternalStoreDetailTabs(role)
  const parsedTab = parseInternalStoreDetailTab(requestedTab)

  if (
    parsedTab &&
    visibleTabs.some(definition => definition.value === parsedTab)
  ) {
    return parsedTab
  }

  return visibleTabs[0]?.value ?? 'dados'
}

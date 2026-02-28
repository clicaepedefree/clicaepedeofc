'use client'

import { paymentMethods } from '@/features/order/shared/payment-methods'
import { selectedStoreIdAtom } from '@/features/store/state'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner } from '@/shared/spinner'
import { Switch } from '@/shared/switch'
import { Body } from '@/shared/typography/body'
import { useAtom } from 'jotai'
import { useState, useEffect } from 'react'
import { updateAutoEmissionMethods } from '../api'
import { useFiscalConfig, useAutoEmissionMethods } from '../hooks/use-fiscal-config'

export const AutoEmissionConfig = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { data: fiscalConfig, isLoading: isLoadingConfig } = useFiscalConfig(selectedStoreId)
  const {
    data: autoEmissionMethods,
    isLoading: isLoadingMethods,
    invalidate,
  } = useAutoEmissionMethods(selectedStoreId)

  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (autoEmissionMethods) {
      setSelectedMethods(autoEmissionMethods.map(method => method.paymentMethod))
    }
  }, [autoEmissionMethods])

  const handleToggle = (methodId: string, checked: boolean) => {
    setSelectedMethods(previousMethods => {
      if (checked) {
        return [...previousMethods, methodId]
      }
      return previousMethods.filter(method => method !== methodId)
    })
  }

  const handleSave = async () => {
    if (!selectedStoreId) return

    setIsSaving(true)
    try {
      await updateAutoEmissionMethods(selectedStoreId, selectedMethods)
      invalidate()
      dispatchToast({ message: 'Configuração de emissão automática salva!', type: 'success' })
    } catch (error) {
      dispatchToast({
        message: error instanceof Error ? error.message : 'Erro ao salvar configuração',
        type: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoadingConfig || isLoadingMethods) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  const isDisabled = fiscalConfig?.status !== 'active'

  return (
    <div className="space-y-2">
      <SettingsCategoryBlock title="Emissão automática de NFC-e" contentClassName="grid-cols-1">
        {isDisabled && (
          <div className="text-amber-600 mb-4">
            <Body>
              Complete a configuração fiscal (empresa, certificado) para habilitar a emissão
              automática.
            </Body>
          </div>
        )}

        <Body highlight="secondary" className="mb-4">
          Selecione os métodos de pagamento para os quais a NFC-e será emitida automaticamente
          após a conclusão do pedido.
        </Body>

        <div className="space-y-3">
          {paymentMethods.map(method => (
            <div
              key={method.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="h-6 w-6 text-muted-foreground">{method.icon}</span>
                <Body fontWeight="medium">{method.name}</Body>
              </div>
              <Switch
                checked={selectedMethods.includes(method.id)}
                onCheckedChange={checked => handleToggle(method.id, checked)}
                disabled={isDisabled}
              />
            </div>
          ))}
        </div>
      </SettingsCategoryBlock>

      <div className="inline-flex grow bg-white border-1 rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2">
        <Button onClick={handleSave} disabled={isDisabled || isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}

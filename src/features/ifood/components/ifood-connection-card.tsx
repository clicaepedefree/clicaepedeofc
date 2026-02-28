'use client'

import { disconnectIFoodAccount } from '@/features/ifood/api'
import { IFoodConnectionModal } from '@/features/ifood/components/ifood-connection-modal'
import { useIFoodConnection } from '@/features/ifood/hooks/use-ifood-connection'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

const IFOOD_CLIENT_ID = process.env.NEXT_PUBLIC_IFOOD_CLIENT_ID

export function IFoodConnectionCard() {
  const storeId = useAtomValue(selectedStoreIdAtom)
  const router = useRouter()
  const { connection, isLoading, refetch } = useIFoodConnection(storeId!)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleConnect = () => {
    if (!storeId) {
      toast.error('Selecione uma loja primeiro')
      return
    }

    if (!IFOOD_CLIENT_ID) {
      toast.error('Configuracao do iFood nao encontrada')
      return
    }

    // Open the connection modal instead of navigating away
    setIsModalOpen(true)
  }

  const handleConnectionSuccess = () => {
    refetch()
  }

  const handleDisconnect = async () => {
    if (!storeId) return

    if (
      !confirm(
        'Tem certeza que deseja desconectar o iFood? Você precisará autorizar novamente para sincronizar.'
      )
    ) {
      return
    }

    setIsDisconnecting(true)
    try {
      await disconnectIFoodAccount(storeId)
      toast.success('iFood desconectado com sucesso')
      refetch()
    } catch (error) {
      console.error('Error disconnecting iFood:', error)
      toast.error('Erro ao desconectar iFood')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleManageMenu = () => {
    router.push('/settings/integracoes/ifood/setup')
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">iFood</h3>
            <p className="text-sm text-gray-500">Carregando...</p>
          </div>
        </div>
      </div>
    )
  }

  const isConnected = connection?.status === 'connected'

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-8">
        <div className="flex-1">
          <div className="flex items-center gap-8">
            <h3 className="text-lg font-semibold">iFood</h3>
            {isConnected ? (
              <Badge variant="default" className="bg-green-100 text-green-800">
                Conectado
              </Badge>
            ) : (
              <Badge variant="secondary">Desconectado</Badge>
            )}
          </div>

          {isConnected && connection && (
            <div className="mt-2 space-y-2 text-sm text-gray-600">
              <p>
                <b>Merchant ID:</b> {connection.merchantId}
              </p>
              {connection.lastSyncAt && (
                <p>
                  <b>Última sincronização:</b>{' '}
                  {new Date(connection.lastSyncAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}

          {!isConnected && (
            <p className="mt-1 text-sm text-gray-500">
              Conecte sua conta do iFood para sincronizar o cardápio e atualizar
              códigos PDV.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button variant="default" onClick={handleManageMenu}>
                Gerenciar Cardapio
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
              </Button>
            </>
          ) : (
            <Button variant="default" onClick={handleConnect}>
              Conectar
            </Button>
          )}
        </div>
      </div>

      {/* Connection Modal */}
      {storeId && (
        <IFoodConnectionModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          storeId={storeId}
          onSuccess={handleConnectionSuccess}
        />
      )}
    </div>
  )
}

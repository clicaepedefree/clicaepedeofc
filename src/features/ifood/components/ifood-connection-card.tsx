'use client'

import { disconnectIFoodAccount } from '@/features/ifood/api'
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

  const handleConnect = async () => {
    if (!storeId) {
      toast.error('Selecione uma loja primeiro')
      return
    }

    if (!IFOOD_CLIENT_ID) {
      toast.error('Configuração do iFood não encontrada')
      return
    }

    try {
      // Step 1: Generate userCode via backend
      const response = await fetch('/api/integrations/ifood/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth flow')
      }

      const data = await response.json()

      // Store the verifier temporarily in sessionStorage
      sessionStorage.setItem('ifood_verifier', data.authorizationCodeVerifier)
      sessionStorage.setItem('ifood_store_id', storeId.toString())

      // Navigate to the authorize page which will display the userCode
      router.push(
        `/settings/integracoes/ifood/authorize?userCode=${data.userCode}&verificationUrl=${encodeURIComponent(data.verificationUrlComplete)}`
      )
    } catch (error) {
      console.error('Error initiating iFood connection:', error)
      toast.error('Erro ao iniciar conexão com iFood')
    }
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
                Gerenciar Cardápio
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
    </div>
  )
}

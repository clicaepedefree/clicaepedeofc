'use client'

import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { useEffect, useState } from 'react'

type ConnectionData = {
  id: number
  storeId: number
  merchantId: string
  merchantName: string | null
  catalogId: string | null
  catalogName: string | null
  status: string
  lastSyncAt: string | null
  tokenExpiresAt: string
  hasAccessToken: boolean
  hasRefreshToken: boolean
}

type ApiResponse = {
  success: boolean
  message: string
  hasConnection: boolean
  connection?: ConnectionData
  error?: string
}

/**
 * Test page for Feature #29: iFood connection status persists after page refresh
 *
 * This page tests that:
 * 1. Connection data is loaded from the database
 * 2. Catalog name is displayed correctly
 * 3. Connected state shows properly
 * 4. Data persists after page refresh
 */
export default function TestIFoodPersistencePage() {
  const [connection, setConnection] = useState<ConnectionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [loadTime, setLoadTime] = useState<string>('')

  const fetchConnection = async () => {
    setIsLoading(true)
    setError(null)
    const startTime = Date.now()

    try {
      const response = await fetch('/api/test-ifood-connection-persistence')
      const data: ApiResponse = await response.json()

      if (data.success && data.hasConnection && data.connection) {
        setConnection(data.connection)
      } else if (data.success && !data.hasConnection) {
        setConnection(null)
      } else {
        setError(data.error || 'Unknown error')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
      setLoadTime(new Date().toLocaleTimeString('pt-BR'))
      setRefreshCount(prev => prev + 1)
    }
  }

  const createTestConnection = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/test-ifood-connection-persistence', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        await fetchConnection()
      } else {
        setError(data.error || 'Failed to create connection')
        setIsLoading(false)
      }
    } catch (err) {
      setError(String(err))
      setIsLoading(false)
    }
  }

  const deleteTestConnection = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/test-ifood-connection-persistence', {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        await fetchConnection()
      } else {
        setError(data.error || 'Failed to delete connection')
        setIsLoading(false)
      }
    } catch (err) {
      setError(String(err))
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConnection()
  }, [])

  const isConnected = connection?.status === 'connected'

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Feature #29: iFood Connection Persistence Test</h1>
        <p className="text-muted-foreground mb-6">
          Tests that iFood connection status persists after page refresh.
        </p>

        {/* Test Controls */}
        <div className="flex gap-2 mb-6">
          <Button variant="outline" onClick={fetchConnection} disabled={isLoading}>
            Refresh Data
          </Button>
          <Button variant="default" onClick={createTestConnection} disabled={isLoading}>
            Create Test Connection
          </Button>
          <Button variant="destructive" onClick={deleteTestConnection} disabled={isLoading}>
            Delete Connection
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Hard Refresh (F5)
          </Button>
        </div>

        {/* Load Status */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm">
          <p><strong>Load Count:</strong> {refreshCount}</p>
          <p><strong>Last Load:</strong> {loadTime || 'Loading...'}</p>
          <p><strong>Status:</strong> {isLoading ? 'Loading...' : error ? `Error: ${error}` : 'Ready'}</p>
        </div>

        {/* Simulated iFood Connection Card - Same as real component */}
        <div className="rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-8">
                <h3 className="text-lg font-semibold">iFood</h3>
                {isLoading ? (
                  <Badge variant="outline">Loading...</Badge>
                ) : isConnected ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">Desconectado</Badge>
                )}
              </div>

              {isConnected && connection && (
                <div className="mt-2 space-y-2 text-sm text-gray-600">
                  {connection.merchantName && (
                    <p>
                      <b>Loja:</b> {connection.merchantName}
                    </p>
                  )}
                  {connection.catalogName && (
                    <p>
                      <b>Cardapio:</b> {connection.catalogName}
                    </p>
                  )}
                  <p>
                    <b>Merchant ID:</b> {connection.merchantId}
                  </p>
                  {connection.lastSyncAt && (
                    <p>
                      <b>Ultima sincronizacao:</b>{' '}
                      {new Date(connection.lastSyncAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {!isConnected && !isLoading && (
                <p className="mt-1 text-sm text-gray-500">
                  Conecte sua conta do iFood para sincronizar o cardapio.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {isConnected ? (
                <>
                  <Button variant="default">
                    Gerenciar Cardapio
                  </Button>
                  <Button variant="outline">
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button variant="default" disabled={isLoading}>
                  Conectar
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <h2 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">Feature #29 Verification Checklist</h2>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-center gap-2">
              <span className={connection ? 'text-green-600' : 'text-gray-400'}>
                {connection ? '✓' : '○'}
              </span>
              Data loads from database on page load
            </li>
            <li className="flex items-center gap-2">
              <span className={isConnected ? 'text-green-600' : 'text-gray-400'}>
                {isConnected ? '✓' : '○'}
              </span>
              Connected state shows &quot;Conectado&quot; badge
            </li>
            <li className="flex items-center gap-2">
              <span className={connection?.catalogName ? 'text-green-600' : 'text-gray-400'}>
                {connection?.catalogName ? '✓' : '○'}
              </span>
              Catalog name displays: {connection?.catalogName || '(not set)'}
            </li>
            <li className="flex items-center gap-2">
              <span className={connection?.merchantName ? 'text-green-600' : 'text-gray-400'}>
                {connection?.merchantName ? '✓' : '○'}
              </span>
              Merchant name displays: {connection?.merchantName || '(not set)'}
            </li>
            <li className="flex items-center gap-2">
              <span className={isConnected ? 'text-green-600' : 'text-gray-400'}>
                {isConnected ? '✓' : '○'}
              </span>
              &quot;Gerenciar Cardapio&quot; and &quot;Desconectar&quot; buttons visible when connected
            </li>
            <li className="flex items-center gap-2">
              <span className="text-blue-600">→</span>
              Click &quot;Hard Refresh (F5)&quot; to test persistence after page reload
            </li>
          </ul>
        </div>

        {/* Raw Data */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">Raw Connection Data</summary>
          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
            {JSON.stringify(connection, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}

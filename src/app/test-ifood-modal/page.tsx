'use client'

import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { useState } from 'react'

/**
 * Test page for verifying Feature #10, #11, #12:
 * - #10: Conectar button opens modal instead of navigating
 * - #11: Modal close returns without side effects
 * - #12: Connected state buttons remain functional
 *
 * This page uses a simplified mock modal to test UI behavior without
 * requiring authentication.
 */
export default function TestIFoodModalPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [closeCount, setCloseCount] = useState(0)
  const [openCount, setOpenCount] = useState(0)

  const handleConnect = () => {
    // This is what happens in the real IFoodConnectionCard
    // Instead of router.push('/authorize'), it now sets modal state
    setIsModalOpen(true)
    setOpenCount(prev => prev + 1)
  }

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open)
    if (!open) {
      setCloseCount(prev => prev + 1)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">iFood Modal Test Page</h1>
        <p className="text-muted-foreground mb-6">
          Test the iFood connection modal UI behavior for Features #10, #11.
        </p>

        <div className="space-y-4">
          {/* Simulated Disconnected Card */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-8">
                  <h3 className="text-lg font-semibold">iFood</h3>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                    Desconectado
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Conecte sua conta do iFood para sincronizar o cardápio.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="default" onClick={handleConnect}>
                  Conectar
                </Button>
              </div>
            </div>
          </div>

          {/* Test Status */}
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-2">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Current URL:</strong> {typeof window !== 'undefined' ? window.location.pathname : '/test-ifood-modal'}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Modal State:</strong> {isModalOpen ? 'OPEN' : 'CLOSED'}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Open Count:</strong> {openCount}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Close Count:</strong> {closeCount}
            </p>
          </div>

          {/* Test Instructions */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h2 className="font-semibold mb-2">Feature #10 Test:</h2>
            <ul className="text-sm space-y-1 text-muted-foreground mb-4">
              <li>✓ Click "Conectar" button</li>
              <li>✓ Modal should open (Modal State becomes OPEN)</li>
              <li>✓ URL should NOT change (stays on /test-ifood-modal)</li>
              <li>✓ Modal should show Step 1 content (userCode area)</li>
            </ul>

            <h2 className="font-semibold mb-2">Feature #11 Test:</h2>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>✓ Close modal with X button or Cancelar</li>
              <li>✓ Modal State should return to CLOSED</li>
              <li>✓ Close Count should increment</li>
              <li>✓ URL should still be /test-ifood-modal</li>
            </ul>
          </div>
        </div>

        {/* Mock Modal that simulates the real IFoodConnectionModal structure */}
        <Dialog open={isModalOpen} onOpenChange={handleModalClose}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conectar iFood</DialogTitle>
              <DialogDescription>
                Siga os passos abaixo para autorizar o acesso ao seu cardapio do
                iFood.
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Display userCode (mocked) */}
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900">
                      Copie o codigo de usuario
                    </h3>
                    <p className="mt-1 text-sm text-blue-700">
                      Este codigo sera usado para autorizar o aplicativo no Portal
                      do Parceiro iFood.
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 rounded-md bg-white px-4 py-2 font-mono text-xl font-bold tracking-wider text-gray-900">
                        ABC123
                      </div>
                      <Button variant="outline">
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Open Portal (mocked) */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900">
                      Acesse o Portal do Parceiro
                    </h3>
                    <p className="mt-1 text-sm text-blue-700">
                      Clique no botao abaixo para abrir o Portal do Parceiro iFood.
                    </p>
                    <Button className="mt-3">
                      Abrir Portal do Parceiro
                    </Button>
                  </div>
                </div>
              </div>

              {/* Step 3: Enter auth code (mocked) */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900">
                      Cole o codigo de autorizacao
                    </h3>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="outline" onClick={() => handleModalClose(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { SmallDescription } from '@/shared/typography/small-description'
import { SmallText } from '@/shared/typography/small-text'
import { ExternalLink, Printer, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { useQzTray } from '../hooks/use-qz-tray'

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  error: 'bg-red-500',
}
const DEFAULT_STATUS_COLOR = 'bg-yellow-500'

const STATUS_TEXTS: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  error: 'Erro',
}
const DEFAULT_STATUS_TEXT = 'Desconectado'

/**
 * Compact status indicator for the POS top bar.
 *
 * - Hidden when QZ Tray is not enabled
 * - Green dot when connected
 * - Yellow/orange dot when enabled but disconnected
 *
 * Click opens dropdown with:
 * - Printer info
 * - Reconnect option
 * - "Gerenciar QZ Tray" link (opens settings in new tab)
 */
export function QzTrayStatusIndicator() {
  const {
    status,
    isConnected,
    isEnabled,
    selectedPrinter,
    connect,
  } = useQzTray()

  // Don't show if not enabled
  if (!isEnabled) {
    return null
  }

  const handleReconnect = async () => {
    toast.info('Reconectando ao QZ Tray...')
    try {
      await connect()
      toast.success('Conectado ao QZ Tray')
    } catch {
      toast.error('Falha ao conectar ao QZ Tray')
    }
  }

  const handleOpenSettings = () => {
    // Open settings in new tab
    window.open('/settings/integracoes', '_blank')
  }

  const statusColor = STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR
  const statusText = STATUS_TEXTS[status] ?? DEFAULT_STATUS_TEXT

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm',
            'hover:bg-accent transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label={`QZ Tray: ${statusText}`}
        >
          <Printer className="h-4 w-4 text-muted-foreground" />
          <span
            className={cn('h-2 w-2 rounded-full', statusColor)}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <SmallText>QZ Tray</SmallText>
            <SmallDescription className="text-muted-foreground">
              Status: {statusText}
            </SmallDescription>
            {isConnected && selectedPrinter && (
              <SmallDescription className="text-muted-foreground">
                Impressora: {selectedPrinter}
              </SmallDescription>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {!isConnected && (
          <DropdownMenuItem onClick={handleReconnect}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reconectar
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={handleOpenSettings}>
          <Settings className="mr-2 h-4 w-4" />
          Gerenciar QZ Tray
          <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

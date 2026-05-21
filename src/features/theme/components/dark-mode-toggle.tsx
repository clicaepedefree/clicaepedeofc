'use client'

import { Switch } from '@/shared/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <div className="hidden h-9 w-[11.75rem] rounded-md bg-muted/60 lg:block" />
    )
  }

  const isDarkModeEnabled = resolvedTheme === 'dark'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
          {isDarkModeEnabled ? (
            <Moon className="h-4 w-4 text-primary" />
          ) : (
            <Sun className="h-4 w-4 text-warning" />
          )}
          <span className="hidden lg:inline">Habilitar modo escuro</span>
          <Switch
            size="sm"
            checked={isDarkModeEnabled}
            aria-label="Habilitar modo escuro"
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </label>
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>Alternar tema do painel</TooltipContent>
    </Tooltip>
  )
}

'use client'

import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/shared/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/popover'

type ComboboxProps = {
  options: { value: string; label: string }[]
  value: string
  onChange: (updatedValue: string) => void
  placeholder?: string
  searchPlaceholder?: string
  noResultMessage?: string
  disabled?: boolean
  disableUnselectingOption?: boolean
}

export const Combobox = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione opção',
  searchPlaceholder = 'Digite opção',
  noResultMessage = 'Nenhuma opção encontrada',
  disabled = false,
  disableUnselectingOption = false,
}: ComboboxProps) => {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
          {value ? options.find(option => option.value === value)?.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command
          loop
          filter={(_, search, keywords = []) => {
            const searchLower = search.toLowerCase()
            const keywordsLowerCase = keywords.map(keyword => keyword.toLowerCase()).join(' ')
            return Number(keywordsLowerCase.includes(searchLower))
          }}
        >
          <CommandInput placeholder={searchPlaceholder} disabled={disabled} />
          <CommandList>
            <CommandEmpty>{noResultMessage}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={currentValue => {
                    if (disableUnselectingOption && currentValue === value) return

                    onChange(currentValue === value ? '' : currentValue)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

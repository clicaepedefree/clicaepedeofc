'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/shared/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/command'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/popover'

type ComboboxBaseOption = { value: string; label: string }

type ComboboxProps<T extends object = ComboboxBaseOption> = {
  options: T[]
  value?: string
  onChange: (updatedValue: string) => void
  placeholder?: string
  searchPlaceholder?: string
  noResultMessage?: string
  disabled?: boolean
  disableUnselectingOption?: boolean
  autoFocus?: boolean
  inputValue?: string
  onInputValueChange?: (updatedValue: string) => void
  customOptionLabelComponent?: (
    option: T,
    searchText: string
  ) => React.ReactNode
  customKeyValueParserForOption?: (option: T) => {
    value: string
    label: string
    keywords?: string[]
  }
  customIcon?: React.ElementType
  contentClassName?: string
  hideOptionsOnEmptyInput?: boolean
}

export const Combobox = <T extends object = ComboboxBaseOption>({
  options,
  customOptionLabelComponent,
  customKeyValueParserForOption,
  customIcon,
  value,
  onChange,
  placeholder = 'Selecione uma opção',
  searchPlaceholder = 'Digite opção',
  noResultMessage = 'Nenhuma opção encontrada',
  disabled = false,
  disableUnselectingOption = false,
  autoFocus = false,
  inputValue,
  onInputValueChange,
  contentClassName,
  hideOptionsOnEmptyInput = false,
}: ComboboxProps<T>) => {
  const [open, setOpen] = React.useState(false)
  const [defaultInputValue, setDefaultInputValue] = React.useState('')

  const getOptionBaseFields = (option: T) => {
    const baseValue = (option as ComboboxBaseOption).value
    const baseLabel = (option as ComboboxBaseOption).label

    if (baseValue && baseLabel) return { value: baseValue, label: baseLabel }

    if (!customKeyValueParserForOption)
      throw new Error(
        'When using custom options, the `customKeyValueParserForOption` is required'
      )

    return customKeyValueParserForOption(option)
  }

  const selectedOption = options.find(
    option => getOptionBaseFields(option).value === value
  )

  const Icon = customIcon ?? ChevronsUpDown

  const inputValueToUse = inputValue ?? defaultInputValue
  const setInputValueToUse = onInputValueChange ?? setDefaultInputValue

  const canDisplayOptions =
    !hideOptionsOnEmptyInput || (inputValueToUse && inputValueToUse.length > 0)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value && selectedOption
            ? getOptionBaseFields(selectedOption).label
            : placeholder}
          <Icon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0 w-[var(--radix-popper-anchor-width)] -translate-y-10',
          contentClassName
        )}
      >
        <Command
          loop
          autoFocus={autoFocus}
          filter={(_, search, keywords = []) => {
            const searchLower = search.toLowerCase()
            const keywordsLowerCase = keywords
              .map(keyword => keyword.toLowerCase())
              .join(' ')
            return Number(keywordsLowerCase.includes(searchLower))
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            disabled={disabled}
            value={inputValueToUse}
            onValueChange={setInputValueToUse}
          />
          <CommandList>
            {canDisplayOptions && (
              <>
                <CommandEmpty>{noResultMessage}</CommandEmpty>
                <CommandGroup>
                  {options.map(option => {
                    const {
                      value: optionValue,
                      label: optionLabel,
                      keywords: optionKeywords = [],
                    } = getOptionBaseFields(option)
                    return (
                      <CommandItem
                        key={optionValue}
                        value={optionValue}
                        keywords={[optionLabel, ...optionKeywords]}
                        onSelect={currentValue => {
                          if (
                            disableUnselectingOption &&
                            currentValue === value
                          )
                            return

                          onChange(currentValue === value ? '' : currentValue)
                          setOpen(false)
                        }}
                      >
                        {customOptionLabelComponent?.(
                          option,
                          inputValueToUse
                        ) ?? (
                          <>
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                value === optionValue
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            {optionLabel}
                          </>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

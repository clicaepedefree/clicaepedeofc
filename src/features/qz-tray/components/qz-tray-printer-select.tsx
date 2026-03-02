'use client'

import { Combobox } from '@/shared/combobox'
import { Printer } from 'lucide-react'

interface QzTrayPrinterSelectProps {
  printers: string[]
  selectedPrinter: string | null
  onSelect: (printerName: string) => void
  disabled?: boolean
}

export function QzTrayPrinterSelect({
  printers,
  selectedPrinter,
  onSelect,
  disabled = false,
}: QzTrayPrinterSelectProps) {
  const options = printers.map(printer => ({
    value: printer,
    label: printer,
  }))

  return (
    <Combobox
      options={options}
      value={selectedPrinter ?? ''}
      onChange={onSelect}
      placeholder="Selecione uma impressora"
      searchPlaceholder="Buscar impressora..."
      noResultMessage="Nenhuma impressora encontrada"
      disabled={disabled}
      disableUnselectingOption
      customIcon={Printer}
    />
  )
}

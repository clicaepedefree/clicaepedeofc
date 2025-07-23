'use client'

import { Combobox } from '@/shared/combobox'
import { Counter } from '../types'

export const CounterSelector = ({
  counters,
  activeCounterId,
  onChangeCounter,
}: {
  counters: Counter[]
  activeCounterId: number
  onChangeCounter?: (counterId: number) => void
}) => {
  const countersOptions = counters?.map(counter => ({
    value: String(counter.id),
    label: counter.name,
  }))

  const activeCounterIdAsString = activeCounterId ? String(activeCounterId) : ''

  return (
    <>
      <Combobox
        options={countersOptions}
        value={activeCounterIdAsString}
        onChange={value => onChangeCounter?.(Number(value))}
        placeholder="Selecione um caixa"
        searchPlaceholder="Buscar caixa"
        noResultMessage="Nenhum caixa encontrado"
        disableUnselectingOption
      />
    </>
  )
}

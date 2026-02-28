'use client'

import { useState } from 'react'
import { OptionRow, OptionRowValue, ItemForOptionRow } from '@/features/option-groups/components/option-row'

const mockItems: ItemForOptionRow[] = [
  { id: 1, name: 'Pizza Margherita', categoryName: 'Pizzas', categoryId: 1, price: '25.00' },
  { id: 2, name: 'Pizza Pepperoni', categoryName: 'Pizzas', categoryId: 1, price: '28.00' },
  { id: 3, name: 'Coca-Cola 350ml', categoryName: 'Bebidas', categoryId: 2, price: '5.00' },
]

export default function TestOptionRowPage() {
  const [option, setOption] = useState<OptionRowValue>({
    itemId: 1,
    itemName: 'Pizza Margherita',
    price: '15.00',
    originalPrice: null,
    minQuantity: 0,
    maxQuantity: 1,
    index: 0,
  })

  const [options, setOptions] = useState<OptionRowValue[]>([
    {
      itemId: 1,
      itemName: 'Pizza Margherita',
      price: '0',
      originalPrice: null,
      minQuantity: 0,
      maxQuantity: 1,
      index: 0,
    },
    {
      itemId: 2,
      itemName: 'Pizza Pepperoni',
      price: '15.50',
      originalPrice: null,
      minQuantity: 0,
      maxQuantity: 2,
      index: 1,
    },
    {
      itemId: 3,
      itemName: 'Coca-Cola 350ml',
      price: '5.00',
      originalPrice: null,
      minQuantity: 0,
      maxQuantity: 3,
      index: 2,
    },
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Test Option Row - Price Display Fix</h1>

      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h2 className="font-semibold text-yellow-800">Test Instructions:</h2>
        <ul className="list-disc list-inside text-yellow-700 mt-2">
          <li>The price should appear ONLY in the input field</li>
          <li>The price should NOT appear duplicated below the input</li>
          <li>When price is 0, "Incluido" badge should appear</li>
          <li>When price &gt; 0, only "Marcar como incluido" link should appear (no price)</li>
        </ul>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Single Option Row (price: R$ 15.00)</h2>
        <div className="border p-4 rounded-lg">
          <OptionRow
            value={option}
            onChange={setOption}
            onRemove={() => console.log('Remove clicked')}
            items={mockItems}
            displayIndex={1}
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Current price value: <code className="bg-muted px-1 rounded">{option.price}</code>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Multiple Options (different prices)</h2>
        <div className="border p-4 rounded-lg space-y-4">
          {options.map((opt, index) => (
            <OptionRow
              key={index}
              value={opt}
              onChange={(updated) => {
                const newOptions = [...options]
                newOptions[index] = updated
                setOptions(newOptions)
              }}
              onRemove={() => {
                setOptions(options.filter((_, i) => i !== index))
              }}
              onMoveUp={index > 0 ? () => {
                const newOptions = [...options]
                const temp = newOptions[index - 1]
                newOptions[index - 1] = newOptions[index]
                newOptions[index] = temp
                setOptions(newOptions)
              } : undefined}
              onMoveDown={index < options.length - 1 ? () => {
                const newOptions = [...options]
                const temp = newOptions[index + 1]
                newOptions[index + 1] = newOptions[index]
                newOptions[index] = temp
                setOptions(newOptions)
              } : undefined}
              items={mockItems}
              displayIndex={index + 1}
            />
          ))}
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Option 1 price: <code className="bg-muted px-1 rounded">{options[0]?.price}</code> (should show "Incluido" badge)</div>
          <div>Option 2 price: <code className="bg-muted px-1 rounded">{options[1]?.price}</code> (should show "Marcar como incluido" link only)</div>
          <div>Option 3 price: <code className="bg-muted px-1 rounded">{options[2]?.price}</code> (should show "Marcar como incluido" link only)</div>
        </div>
      </section>
    </div>
  )
}

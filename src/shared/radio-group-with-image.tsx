import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { CircleCheck } from 'lucide-react'
import Image from 'next/image'
import React from 'react'

type RadioGroupWithImageOption = {
  value: string
  label: string
  logoPath: string
}
type RadioGroupWithImageProps = {
  options: RadioGroupWithImageOption[]
  selectedValue: string
  onValueChange: (value: string) => void
}

export const RadioGroupWithImage = ({ options, selectedValue, onValueChange }: RadioGroupWithImageProps) => {
  return (
    <RadioGroupPrimitive.Root
      value={selectedValue}
      onValueChange={onValueChange}
      className="max-w-xl w-full grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4"
    >
      {options.map(option => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'relative group ring-[1px] ring-border rounded py-3 px-4 text-start',
            'data-[state=checked]:ring-2 data-[state=checked]:ring-primary'
          )}
        >
          <CircleCheck className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-6 w-6 text-primary fill-primary stroke-white group-data-[state=unchecked]:hidden" />

          <div className="flex justify-center mb-3 h-8 relative">
            <Image
              src={option.logoPath}
              alt={`${option.label} logo`}
              width={80}
              height={32}
              className="object-contain"
            />
          </div>
          <Body variant={400} fontWeight="regular" className="tracking-tight text-center">
            {option.label}
          </Body>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

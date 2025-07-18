import { ReceiptTemplate, ReceiptTemplateInput } from '@/features/receipt/types'
import Mustache from 'mustache'
import receiptGenerator from 'receiptline'

export type ReceiptTemplateOptions = {
  columnsPerLine?: number
}

export const BaseTemplate = <T extends ReceiptTemplateInput>({
  templateText,
}: {
  templateText: string
}): ReceiptTemplate<T> => ({
  templateText,
  render: async (data: T, options?: ReceiptTemplateOptions) => {
    const renderedTemplate = renderMustacheTemplate(templateText, data)
    const receiptAsSvgString = generateReceiptSvg(renderedTemplate, options)

    return receiptAsSvgString
  },
})

const renderMustacheTemplate = <T extends ReceiptTemplateInput>(
  templateText: string,
  data: T
) => {
  return Mustache.render(templateText, data)
}

/**
 * Generates an SVG representation of a receipt from ReceiptLine formatted text.
 *
 * Uses the ReceiptLine language to transform receipt text into SVG format.
 * ReceiptLine is a domain-specific language for creating receipt layouts.
 *
 * @param receiptText - The receipt content formatted in ReceiptLine language syntax
 * @param options - Optional configuration for receipt generation
 * @param options.columnsPerLine - Number of characters per line (default: 32)
 * @returns SVG string representation of the receipt
 *
 * @see {@link https://www.ofsc.or.jp/index.php/ReceiptLine} ReceiptLine Documentation
 * @see {@link https://receiptline.github.io/designer/} ReceiptLine Designer Tool
 *
 * @example
 * ```typescript
 * const receiptSvg = generateReceiptSvg(
 *   `|Item|Price|
 * -
 * Item 1|$10.00|
 * Item 2|$15.00|
 * -
 * ^^Total $25.00`,
 *   { columnsPerLine: 40 }
 * );
 * ```
 */
const generateReceiptSvg = (
  receiptText: string,
  options?: ReceiptTemplateOptions
) => {
  const { columnsPerLine = 40 } = options ?? {}
  return receiptGenerator.transform(receiptText, {
    cpl: columnsPerLine,
    encoding: 'multilingual',
    command: 'svg',
  })
}

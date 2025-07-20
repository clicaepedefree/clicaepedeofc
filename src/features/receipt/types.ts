export type ReceiptTemplateInput = Record<string, unknown>

export type ReceiptTemplate<T extends ReceiptTemplateInput> = {
  templateText: string
  preProcessing?: (data: T) => T
  render(data: T): Promise<string>
}

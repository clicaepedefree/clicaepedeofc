export type ReceiptTemplateInput = Record<string, unknown>

export type ReceiptTemplate<T extends ReceiptTemplateInput> = {
  templateText: string
  render(data: T): Promise<string>
}

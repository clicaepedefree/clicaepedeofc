import testReceiptTemplate from '@/features/receipt/templates/test.receipt'
import { BaseTemplate } from './base-template'

export type TestTemplateInput = {
  title: string
}
export const TestTemplate = BaseTemplate<TestTemplateInput>({
  templateText: testReceiptTemplate,
})

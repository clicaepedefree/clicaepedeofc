import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'

type PageHeaderBlockProps = {
  title: string
  subtitle?: string
}

export const PageHeaderBlock = ({ title, subtitle }: PageHeaderBlockProps) => {
  return (
    <div className="bg-white border-b-2 p-4 space-y-2 ">
      <Headline variant={300}>{title}</Headline>
      {subtitle && (
        <Body fontWeight="light" highlight="secondary" variant={100}>
          {subtitle}
        </Body>
      )}
    </div>
  )
}

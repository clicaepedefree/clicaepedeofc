import { H2 } from '@/shared/typography/h2'
import { CreateCategoryActionButton } from '@/features/catalog/components/create-category/create-category-action-button'

export default function Page() {
  return (
    <div className="col-span-2 flex flex-col justify-center items-start">
      <H2>Cardápio / produtos</H2>
      <CreateCategoryActionButton />
    </div>
  )
}

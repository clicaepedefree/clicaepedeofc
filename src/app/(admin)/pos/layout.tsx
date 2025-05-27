import { AdminPageInfo } from '@/features/admin/components/admin-page-info'

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Ponto de Venda' }} />
      {children}
    </>
  )
}

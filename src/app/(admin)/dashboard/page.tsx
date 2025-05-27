import { AdminPageInfo } from '@/features/admin/components/admin-page-info'

export default function Page() {
  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Dashboard' }} />
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
      </div>
      <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
    </>
  )
}

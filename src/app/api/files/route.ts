import { createRouteHandler } from 'uploadthing/next'

import { filesManagerRouterService } from '@/services/files-manager'

export const { GET, POST } = createRouteHandler({
  router: filesManagerRouterService,
})

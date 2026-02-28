import { db } from '@/services/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  const startTime = Date.now()

  try {
    // Execute a simple query to verify database connectivity
    const result = await db.execute(sql`SELECT 1 as health_check`)

    const responseTime = Date.now() - startTime

    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        responseTime: `${responseTime}ms`,
      },
      version: process.env.npm_package_version || '0.1.0',
    })
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error('Health check failed:', error)

    return Response.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          status: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: `${responseTime}ms`,
        },
        version: process.env.npm_package_version || '0.1.0',
      },
      { status: 503 }
    )
  }
}

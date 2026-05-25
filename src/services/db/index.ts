import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as dbSchema from './schema'

config({ path: '.env.local' })

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
const enableDbQueriesDebugger = process.env.DRIZZLE_DEBUG === 'true'

if (!connectionString) {
  throw new Error('Missing database connection string. Set POSTGRES_URL or DATABASE_URL.')
}

const client = postgres(connectionString, {
  prepare: false,
})
export const db = drizzle({
  schema: dbSchema,
  client,
  logger: enableDbQueriesDebugger,
})

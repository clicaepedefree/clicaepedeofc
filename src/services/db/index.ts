import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as dbSchema from './schema'

config({ path: '.env.local' })

const connectionString = process.env.POSTGRES_URL
const enableDbQueriesDebugger = process.env.DRIZZLE_DEBUG === 'true'

const client = postgres(connectionString!)
export const db = drizzle({
  schema: dbSchema,
  client,
  logger: enableDbQueriesDebugger,
})

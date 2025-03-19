import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local' })

export default defineConfig({
  schema: './src/services/db/schema/*',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
  verbose: true,
  strict: true,
})

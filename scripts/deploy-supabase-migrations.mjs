import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const projectUrl = process.env.VITE_SUPABASE_URL?.trim()

if (!accessToken || !projectUrl) {
  throw new Error('SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL are required.')
}

const projectRef = new URL(projectUrl).hostname.split('.')[0]
const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/migrations`
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
}

async function managementRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase migration API ${response.status}: ${body}`)
  }

  return response.status === 204 ? null : response.json().catch(() => null)
}

const history = await managementRequest(apiUrl)
const latestRemoteVersion = Array.isArray(history)
  ? history.reduce((latest, migration) =>
      String(migration?.version ?? '') > latest ? String(migration.version) : latest, '')
  : ''
const migrationDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort()
const pendingFiles = migrationFiles.filter(
  (file) => file.split('_', 1)[0] > latestRemoteVersion,
)

for (const file of pendingFiles) {
  const query = await readFile(join(migrationDirectory, file), 'utf8')
  const version = file.split('_', 1)[0]
  const name = basename(file, '.sql').slice(version.length + 1)
  const idempotencyKey = createHash('sha256').update(file).digest('hex')

  await managementRequest(apiUrl, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ name, query }),
  })
  console.log(`Applied ${file}`)
}

if (!pendingFiles.length) {
  console.log('Supabase migrations are up to date.')
}

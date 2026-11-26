import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const certDir = join(project, '.certs')
const caDir = join(certDir, 'ca')
const certificate = join(certDir, 'desktop.pem')
const key = join(certDir, 'desktop-key.pem')
const binaryName = process.platform === 'win32' ? 'mkcert.exe' : 'mkcert'
const localBinary = join(project, '.local', 'bin', binaryName)
const mkcert = existsSync(localBinary) ? localBinary : binaryName
const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
  (entries ?? [])
    .filter(({ internal, family }) => !internal && family === 'IPv4')
    .map(({ address }) => address),
)
const extraAddresses = process.argv.slice(2)

if (extraAddresses.some((address) => !isIP(address))) {
  throw new Error('Pass additional IPv4 or IPv6 addresses after npm run cert:setup --.')
}

const names = [...new Set(['localhost', '127.0.0.1', '::1', ...addresses, ...extraAddresses])]
mkdirSync(caDir, { recursive: true, mode: 0o700 })

try {
  execFileSync(mkcert, ['-cert-file', certificate, '-key-file', key, ...names], {
    cwd: project,
    env: { ...process.env, CAROOT: caDir },
    stdio: 'inherit',
  })
  chmodSync(key, 0o600)
  console.log('\nCA certificate for test clients is .certs/ca/rootCA.pem')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error('Install mkcert or place its executable in .local/bin and run npm run cert:setup again.')
    process.exitCode = 1
  } else {
    throw error
  }
}

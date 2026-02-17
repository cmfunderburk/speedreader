import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

const DEFAULT_READER_DEV_PORT = 5417

function resolveReaderDevPort(): number {
  const rawPort = process.env.READER_DEV_PORT
  if (!rawPort) return DEFAULT_READER_DEV_PORT

  const parsedPort = Number.parseInt(rawPort, 10)
  if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    console.warn(
      `[reader] Invalid READER_DEV_PORT "${rawPort}". Falling back to ${DEFAULT_READER_DEV_PORT}.`,
    )
    return DEFAULT_READER_DEV_PORT
  }

  return parsedPort
}

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron' || process.env.ELECTRON === 'true'
  const devPort = resolveReaderDevPort()

  return {
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron([
              {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron', 'path', 'fs', 'url', 'jsdom', 'pdf-parse', 'epub'],
                    },
                  },
                },
              },
              {
                entry: 'electron/preload.ts',
                onstart(options) {
                  options.reload()
                },
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            ]),
            renderer(),
          ]
        : []),
    ],
    server: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
    },
  }
})

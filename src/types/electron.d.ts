import type { CorpusAPI, LibraryAPI, SecureKeysAPI } from '../../shared/electron-contract'

export type * from '../../shared/electron-contract'

declare global {
  interface Window {
    library?: LibraryAPI
    corpus?: CorpusAPI
    secureKeys?: SecureKeysAPI
  }
}

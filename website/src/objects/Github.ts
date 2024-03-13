export interface TauriRelease {
  version: string
  notes: string
  pub_date: string
  platforms: {
    "windows-x86_64": {
      signature: string
      url: string
    }
  }
}

export interface GithubRelease {
  version: string
  publicationDate: Date
  url: string
}
export interface CloudConfig {
  CLOUD_ENV_ID: string
}

export const env: CloudConfig = {
  CLOUD_ENV_ID: (import.meta.env.VITE_CLOUD_ENV_ID || '').trim(),
}

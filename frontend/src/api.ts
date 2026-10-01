export interface Charger {
  id: string
  connected: boolean
  connectors: {
    connectorId: number
    status: string
    errorCode: string
    updatedAt: string
    transactionId?: number
    meterValue?: {
      timestamp: string
      sampledValue: {
        value: string
        measurand?: string
        unit?: string
        phase?: string
      }[]
    }
  }[]
}

export interface CommandResponse {
  status: 'Accepted' | 'Rejected'
}

const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options)
  const data = await response.json()
  // The stop endpoint can return an exception object with HTTP 200.
  if (!response.ok || (typeof data.status === 'number' && data.status >= 400)) {
    throw new Error(data.message || data.response?.message || `Request failed (${response.status})`)
  }
  return data as T
}

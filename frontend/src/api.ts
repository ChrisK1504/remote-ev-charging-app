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

export class ApiError extends Error {
   readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const data = await response.json();
  // The stop endpoint can return an exception object with HTTP 200.
  if (!response.ok) {
    throw new ApiError(
      data.message || `Request failed (${response.status})`,
      response.status,
    )
  }
  return data as T
}

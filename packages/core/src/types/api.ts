export type ApiResponse<T> =
  | {
      success: true
      data: T
      message?: string
    }
  | {
      success: false
      message: string
    }

export interface HealthData {
  status: 'healthy'
  timestamp: string
  uptime: number
}

export type HealthResponse = ApiResponse<HealthData>

import type { OmpApi } from '../../shared/omp-api'

declare global {
  interface Window {
    omp: OmpApi
  }
}

export const api: OmpApi = window.omp

import type { CapacityPlannerApi } from '../shared/types'

declare global {
  interface Window {
    capacityPlanner: CapacityPlannerApi
  }
}

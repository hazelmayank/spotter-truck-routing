import type { RiskLevel } from '../types'

export const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL']

export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: '#16a34a',
  MODERATE: '#facc15',
  HIGH: '#f97316',
  SEVERE: '#dc2626',
  NO_TRAVEL: '#3b0764',
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  SEVERE: 'Severe',
  NO_TRAVEL: 'No travel',
}

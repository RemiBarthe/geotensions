import { startOfDay, subYears } from 'date-fns'

export const TIME_CONFIG = {
  COVERAGE_START_DATE: new Date(1997, 0, 1),
  COVERAGE_END_DATE: subYears(startOfDay(new Date()), 1),
} as const

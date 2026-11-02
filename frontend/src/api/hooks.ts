import { useMutation, useQuery } from '@tanstack/react-query'
import type { PlanRequest, PlanResponse, Route } from '../types'
import { ApiError, requestHeatmap, requestPlan } from './client'

export function usePlan() {
  return useMutation<PlanResponse, ApiError, PlanRequest>({ mutationFn: requestPlan })
}

/** Fetches all 49 forecast hours once, after a plan exists; the slider only picks an hour. */
export function useHeatmap(routes: Route[] | undefined, departure: string, loadLb: number) {
  return useQuery({
    queryKey: ['heatmap', routes?.map((route) => route.id), departure, loadLb],
    queryFn: () =>
      requestHeatmap({
        routes: (routes ?? []).map(({ id, geometry }) => ({ id, geometry })),
        departure,
        load_lb: loadLb,
      }),
    enabled: routes !== undefined && routes.length > 0,
    staleTime: Infinity,
    retry: false,
  })
}

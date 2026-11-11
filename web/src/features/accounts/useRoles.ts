import { useQuery } from '@tanstack/react-query'
import { listRoles } from '@/shared/api/roles'

/** The role-permission matrix from the server. Admin only; it changes only with a deploy, so it is cached for a while. */
export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: listRoles, staleTime: 5 * 60_000 })
}

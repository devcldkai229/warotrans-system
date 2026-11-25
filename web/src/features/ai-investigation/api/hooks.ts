import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aiApi, type CaseView, type IssueProposal } from '@/shared/api/ai'

const ACTIVE: string[] = ['INVESTIGATING']

export function useCases(status?: string) {
  return useQuery({ queryKey: ['ai', 'cases', status ?? 'all'], queryFn: () => aiApi.cases(status), refetchInterval: 10_000 })
}

/** Polls every 2 s while the AI is working on the case, so the stepper and results update live. */
export function useCase(id: string) {
  return useQuery({
    queryKey: ['ai', 'case', id],
    queryFn: () => aiApi.case(id),
    refetchInterval: (q) => (ACTIVE.includes((q.state.data as CaseView | undefined)?.case.status ?? '') ? 2_000 : false),
  })
}

export function useScenarios() {
  return useQuery({ queryKey: ['ai', 'scenarios'], queryFn: aiApi.scenarios, staleTime: Infinity })
}

function useCaseMutation<TArgs, TResult>(id: string, fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'case', id] })
      void qc.invalidateQueries({ queryKey: ['ai', 'cases'] })
    },
  })
}

export const useInvestigate = (id: string) => useCaseMutation(id, () => aiApi.investigate(id))
export const useAsk = (id: string) => useCaseMutation(id, (q: string) => aiApi.ask(id, q))
export const usePropose = (id: string) =>
  useCaseMutation(id, (action: IssueProposal['action'] | undefined) => aiApi.propose(id, action ?? 'CREATE_ISSUE_REPORT'))
export const useStartResolution = (id: string) => useCaseMutation(id, () => aiApi.startResolution(id))
export const useVerify = (id: string) =>
  useCaseMutation(id, (b: { method: string; passed: boolean; notes: string; evidence: string[] }) => aiApi.verify(id, b))
export const useDismiss = (id: string) => useCaseMutation(id, (reason: string) => aiApi.dismiss(id, reason))
export const useReopen = (id: string) => useCaseMutation(id, (reason: string) => aiApi.reopen(id, reason))

/** Approve (server issues a single-use approval bound to the exact payload) then execute it. */
export const useApproveAndExecute = (id: string) =>
  useCaseMutation(id, async (p: IssueProposal) => {
    const approval = await aiApi.approve(id, p)
    return aiApi.execute(id, approval.approvalId, p.payload)
  })

export function useOpenScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scenarioId: string) => aiApi.open(scenarioId),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['ai', 'cases'] }),
  })
}

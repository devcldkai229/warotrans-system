/** Vietnamese translations, keyed by the English sentence. One file per area under ./vi/. */
import { vi_dashboard_jobs } from './vi/dashboard-jobs'
import { vi_enums } from './vi/enums'
import { vi_management } from './vi/management'
import { vi_maps } from './vi/maps'
import { vi_notifications } from './vi/notifications'
import { vi_operations_robots } from './vi/operations-robots'
import { vi_requests } from './vi/requests'
import { vi_shell } from './vi/shell'
import { vi_workflows } from './vi/workflows'

export const vi: Record<string, string> = {
  ...vi_dashboard_jobs,
  ...vi_enums,
  ...vi_management,
  ...vi_maps,
  ...vi_notifications,
  ...vi_operations_robots,
  ...vi_requests,
  ...vi_shell,
  ...vi_workflows,
}

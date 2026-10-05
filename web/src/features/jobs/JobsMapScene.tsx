import { Icon } from '@/shared/ui/Icon'
import type { JobView } from '@/shared/api/contracts'

interface JobsMapSceneProps {
  /** Running Jobs with an assigned Robot get a marker; the scene only has two decorative slots. */
  jobs: JobView[]
}

// The scene stands in for the published MapVersion image + Zone/Edge geometry. Markers come from Job data.
export function JobsMapScene({ jobs }: JobsMapSceneProps) {
  const [first, second] = jobs.filter((job) => job.status === 'RUNNING' && job.assignedRobot)

  return (
    <div className="jscene">
      <div className="jscene__frame">
        <div className="jscene__chargers">
          <header>
            CHARGERS <small>3 / 4 FREE</small>
          </header>
          <div>
            <span>CH-1</span>
            <span className="is-off">CH-2</span>
            <span>CH-3</span>
          </div>
        </div>

        <div className="jscene__lane jscene__lane--v1">
          <Icon name="arrowRight" size={20} />
        </div>
        <div className="jscene__lane jscene__lane--v2" />

        <div className="jscene__floor">
          <header>
            <Icon name="layers" size={13} /> PRODUCTION FLOOR A <em>Optimal Ops</em>
          </header>
          <div className="jscene__stations">
            {['Station 1', 'Station 2', 'Station 3', 'Station 4'].map((name, index) => (
              <div key={name}>
                {name}
                <small>P-10{index + 1}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="jscene__qa">
          <header>
            <Icon name="check" size={13} /> QUALITY ASSURANCE
          </header>
          <div className="jscene__qa-lane">
            <Icon name="arrowRight" size={18} />
          </div>
        </div>

        <div className="jscene__labs">
          <header>
            <Icon name="box" size={13} /> RESEARCH &amp; LABS <small>R&amp;D SECURE</small>
          </header>
        </div>

        <div className="jscene__highway">
          <Icon name="arrowRight" size={20} />
          <Icon name="arrowRight" size={20} />
          <Icon name="arrowRight" size={20} />
          <Icon name="arrowRight" size={20} />
        </div>
        <div className="jscene__junction">
          JCT-A4
          <small>Yield Priority</small>
        </div>

        {first ? (
          <>
            <div className="jscene__amr jscene__amr--a">
              <Icon name="navigate" size={14} />
              <small>{first.assignedRobot?.code}</small>
            </div>
            <div className="jscene__tip jscene__tip--a">
              <strong>{first.jobNo}</strong> ({first.status})
              <small>Batt: {first.assignedRobot?.batteryPercent}%</small>
            </div>
          </>
        ) : null}

        {second ? (
          <>
            <div className="jscene__amr jscene__amr--b">
              <Icon name="navigate" size={14} />
              <small>{second.assignedRobot?.code}</small>
            </div>
            <div className="jscene__tip jscene__tip--b">
              <strong>{second.jobNo}</strong> ({second.status})
              <small>Batt: {second.assignedRobot?.batteryPercent}%</small>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

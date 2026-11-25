"""IssueReport + Jira for the traffic bug the technical E2E found (case N1, R241126005): a partial grant leaves the
robot at the end of its reservation, the gate closes OUTSIDE_RESERVATION, and nobody grants more."""
import json

from api import Api

DESC = """Traffic: a robot stops at the end of a PARTIAL (prefix) grant and waits for ever (technical E2E 2026-11-24, case N1, TR R241126005, RBT-002, map V021, develop).

Observed
- RealRobot profile: semantic prefix grant, horizon 0.6 m (Traffic:SemanticPrefixGrant=true, SemanticHorizonMeters=0.6).
- The robot drives to the end of the granted prefix; the robot gate then closes with OUTSIDE_RESERVATION.
- The Host still sees the robot Authorized: nobody asks for, or grants, the rest of the path.
- The robot stands still until the MOVE ends with RESULT_TIMEOUT; the job goes PAUSED.

Expected
- Before the robot reaches the end of its reservation, the next part of the path is requested and granted (or the robot is told to wait at a legal wait point), never a silent stop inside a lane.

Workaround on the bench
- Host with Traffic__SemanticPrefixGrant=false and Traffic__SemanticHorizonMeters=20 (whole path granted): cases 1-12 ran without the stall.

Suspected
- Fleet traffic: semantic grant extension (prefix grant renewal) vs. the gateway's reservation check; audit items A1/A2; the zone-chain plan (grant the whole zone chain) is the intended fix.

Evidence
- Recorder journal of R241126005 (replay /tech/journals), robot gate OUTSIDE_RESERVATION while the Host reports Authorized."""

a = Api()
robot = next(r["id"] for r in a.host("GET", "/api/fleet/robots?take=50")["items"] if r["code"] == "RBT-002")
issue = a.host("POST", "/api/operations/issues", {"issueType": "ROBOT", "severity": "HIGH", "description": DESC,
                                                   "robotId": robot})
jira = a.host("POST", f"/api/operations/issues/{issue['id']}/jira",
              {"summary": "[WaroTrans] Traffic: robot stalls at the end of a partial grant (OUTSIDE_RESERVATION, never extended)",
               "labels": ["warotrans", "traffic", "technical-e2e"], "links": {}})
print(json.dumps({"issue": issue.get("id"), "jira": jira}, ensure_ascii=False))

"""IssueReport for an AI case (propose -> approve -> execute, as a person approving in the web), then Jira when the AI
says the fault is a code fault.

    python ticket.py <case id> [--jira]
"""
import json
import sys

from api import Api

a = Api()
case_id = sys.argv[1]
view = a.ai("GET", f"/cases/{case_id}")
out = {}
if "CREATE_TICKET" in view["availableActions"]:
    p = a.ai("POST", f"/cases/{case_id}/actions/propose", {})
    appr = a.ai("POST", f"/cases/{case_id}/actions/approve",
                {"action": p["action"], "payload": p["payload"], "case_version": p["caseVersion"]})
    out["issue"] = a.ai("POST", f"/cases/{case_id}/actions/{appr['approvalId']}/execute", {"payload": p["payload"]})
    out["issueDescription"] = p["payload"]["description"]
if "--jira" in sys.argv:
    view = a.ai("GET", f"/cases/{case_id}")
    if "PUSH_JIRA" in view["availableActions"]:
        p = a.ai("POST", f"/cases/{case_id}/actions/propose?action=EXPORT_TO_JIRA", {})
        appr = a.ai("POST", f"/cases/{case_id}/actions/approve",
                    {"action": p["action"], "payload": p["payload"], "case_version": p["caseVersion"]})
        out["jira"] = a.ai("POST", f"/cases/{case_id}/actions/{appr['approvalId']}/execute", {"payload": p["payload"]})
    else:
        out["jira"] = f"not offered: {view['availableActions']}"
print(json.dumps(out, indent=1, ensure_ascii=False))

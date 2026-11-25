"""Dismiss a journal's open AI cases and investigate it again (after a detector fix), then print the new case id.

    python reinvestigate.py <journal id> [reason]
"""
import sys
import time

from api import Api

a = Api()
jid = sys.argv[1]
reason = sys.argv[2] if len(sys.argv) > 2 else "superseded: re-investigated after a detector fix"
for c in a.ai("GET", "/cases")["items"]:
    if c.get("journal_id") == jid and c["status"] not in ("DISMISSED", "TICKETED", "CLOSED"):
        a.ai("POST", f"/cases/{c['id']}/dismiss", {"reason": reason})
a.ai("POST", f"/cases/from-journal/{jid}?investigate=true")
for _ in range(40):
    cs = sorted([c for c in a.ai("GET", "/cases")["items"] if c.get("journal_id") == jid], key=lambda c: c["created_at"])
    if cs and cs[-1]["status"] not in ("INVESTIGATING", "DETECTED", "REOPENED", "DISMISSED"):
        break
    time.sleep(8)
print(cs[-1]["id"] if cs else "no case", cs[-1]["status"] if cs else "")

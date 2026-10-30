SELECT type, status, error_code, reject_reason_code, outcome,
       substring(payload_json::text, 1, 500) AS payload
FROM fleet.robot_commands
ORDER BY issued_at DESC
LIMIT 5;

SELECT js.step_order, js.step_type, js.status, js.failure_code, js.failure_message
FROM execution.job_steps js
JOIN execution.job_tasks jt ON js.job_task_id = jt.id
JOIN execution.jobs j ON jt.job_id = j.id
WHERE j.job_no = 'JOB-20261025-000001'
ORDER BY js.step_order
LIMIT 25;

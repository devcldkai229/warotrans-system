namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>
/// Every action the API protects, named <c>resource.action</c>. Endpoints require one with
/// <see cref="PermissionEndpointExtensions.RequirePermission{TBuilder}"/>; which role holds which permission is
/// decided only in <see cref="RolePermissionMatrix"/>.
/// </summary>
public static class Permissions
{
    // Identity
    public const string UserManage = "user.manage";

    /// <summary>May use the Admin/Technician web console. Staff work in the mobile app.</summary>
    public const string ConsoleAccess = "console.access";

    // Navigation
    public const string MapRead = "map.read";
    public const string MapWrite = "map.write";

    // Warehouse
    public const string WarehouseRead = "warehouse.read";
    public const string WarehouseWrite = "warehouse.write";

    /// <summary>Add a Product to an existing category during receiving.</summary>
    public const string ProductCreate = "product.create";

    public const string ContainerCreate = "container.create";

    /// <summary>Say which shelf a Container that lost its place is really on.</summary>
    public const string ContainerRecover = "container.recover";

    /// <summary>Open, change, confirm and cancel inbound and outbound stock vouchers.</summary>
    public const string VoucherWrite = "voucher.write";

    // Transportation
    public const string TransportRead = "tr.read";
    public const string TransportCreate = "tr.create";
    public const string TransportCancel = "tr.cancel";
    public const string TransportReject = "tr.reject";

    // WorkflowExecution
    public const string WorkflowRead = "workflow.read";
    public const string WorkflowWrite = "workflow.write";
    public const string JobRead = "job.read";

    /// <summary>Start / resume a Job and confirm its human steps.</summary>
    public const string JobOperate = "job.operate";
    public const string JobPause = "job.pause";

    /// <summary>WH-03: take a human step from whoever holds it. Admin only, with a reason.</summary>
    public const string HumanTaskTakeover = "job.takeover";
    public const string JobCancel = "job.cancel";

    // Fleet
    public const string RobotRead = "robot.read";

    /// <summary>Register a robot and change the map it runs on.</summary>
    public const string RobotManage = "robot.manage";

    /// <summary>Enable / disable a robot and put it back in service.</summary>
    public const string RobotConfigure = "robot.configure";

    /// <summary>Send a navigation goal by hand.</summary>
    public const string RobotCommand = "robot.command";

    /// <summary>
    /// Tell a robot where it stands (LOCALIZE at a known endpoint) after it was switched on or moved by hand. Never makes
    /// it move; floor staff need it to bring a robot into service without the right to send it anywhere.
    /// </summary>
    public const string RobotLocalize = "robot.localize";

    /// <summary>Stop / cancel what a robot is doing. Never implies the right to make it move.</summary>
    public const string RobotStop = "robot.stop";
    public const string RobotManualDrive = "robot.manual.drive";
    public const string RobotMaintenance = "robot.maintenance";
    public const string RobotPower = "robot.power";
    public const string RobotDiagnostics = "robot.diagnostics";
    public const string TrafficRead = "traffic.read";
    public const string TrafficManage = "traffic.manage";
    public const string DispatchOverride = "dispatch.override";

    // Payload recovery: what a technician decides about a failed robot. Moving the cargo stays job.operate (Staff).

    /// <summary>Record the technical assessment of a robot that failed with cargo (self-evacuation, manual, repaired).</summary>
    public const string RecoveryAssess = "recovery.technical.assess";

    /// <summary>Let a failed robot drive itself to a recovery point, under traffic control.</summary>
    public const string RecoveryApproveMotion = "recovery.technical.approve_motion";

    /// <summary>Confirm where a failed robot really stands (its last pose is only a hint).</summary>
    public const string RecoveryConfirmLocation = "recovery.technical.confirm_location";

    /// <summary>Confirm the failed robot stands still and safe, so a second robot may come for its cargo.</summary>
    public const string RecoveryConfirmClearance = "recovery.technical.confirm_clearance";

    // Operations
    public const string NotificationRead = "notification.read";
    public const string IssueRead = "issue.read";
    public const string IssueCreate = "issue.create";
    public const string IssueManage = "issue.manage";
    public const string AuditRead = "audit.read";

    // Dashboards
    public const string StatisticsRead = "statistics.read";

    // Evidence (Transport Journal, separate Recorder process: docs/adr/0012)

    /// <summary>Open Transport Journals: runs, paths, events, recording health.</summary>
    public const string EvidenceRead = "evidence.read";

    /// <summary>Watch recorded camera video (a short-lived playback grant is audited).</summary>
    public const string EvidencePlayback = "evidence.playback";

    /// <summary>Add notes, bookmarks and root causes to a Journal.</summary>
    public const string EvidenceAnnotate = "evidence.annotate";

    /// <summary>Export an evidence packet (original clips, hashes, events, path).</summary>
    public const string EvidenceExport = "evidence.export";

    /// <summary>Issue robot recording credentials, read the access audit.</summary>
    public const string EvidenceAdmin = "evidence.admin";

    // Incident investigation (WaroTrans.AI, a separate read-only service; the Host only checks these permissions)

    /// <summary>See AI incident cases: anomaly, hypotheses with evidence, the drafted ticket.</summary>
    public const string IncidentRead = "incident.read";

    /// <summary>Start or repeat an AI investigation of a case and ask it grounded questions.</summary>
    public const string IncidentInvestigate = "incident.investigate";

    /// <summary>Approve an action the AI proposed (e.g. create the IssueReport); executed with the approver's own token.</summary>
    public const string IncidentApprove = "incident.approve";

    /// <summary>Record verification, close, dismiss or reopen a case.</summary>
    public const string IncidentClose = "incident.close";

    // Fault Injection Lab (test-only module, Lab:Enabled; never in production)

    /// <summary>Run controlled fault experiments against lab robots. Admin only.</summary>
    public const string LabOperate = "lab.operate";

    public static IReadOnlyList<string> All { get; } =
    [
        UserManage, ConsoleAccess,
        MapRead, MapWrite,
        WarehouseRead, WarehouseWrite, ProductCreate, ContainerCreate, ContainerRecover, VoucherWrite,
        TransportRead, TransportCreate, TransportCancel, TransportReject,
        WorkflowRead, WorkflowWrite, JobRead, JobOperate, JobPause, JobCancel, HumanTaskTakeover,
        RobotRead, RobotManage, RobotConfigure, RobotCommand, RobotLocalize, RobotStop, RobotManualDrive,
        RobotMaintenance, RobotPower, RobotDiagnostics, TrafficRead, TrafficManage, DispatchOverride,
        RecoveryAssess, RecoveryApproveMotion, RecoveryConfirmLocation, RecoveryConfirmClearance,
        NotificationRead, IssueRead, IssueCreate, IssueManage, AuditRead,
        StatisticsRead,
        EvidenceRead, EvidencePlayback, EvidenceAnnotate, EvidenceExport, EvidenceAdmin,
        IncidentRead, IncidentInvestigate, IncidentApprove, IncidentClose,
        LabOperate
    ];
}

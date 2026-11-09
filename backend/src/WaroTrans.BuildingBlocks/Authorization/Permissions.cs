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
    public const string JobCancel = "job.cancel";

    // Fleet
    public const string RobotRead = "robot.read";

    /// <summary>Register a robot and change the map it runs on.</summary>
    public const string RobotManage = "robot.manage";

    /// <summary>Enable / disable a robot and put it back in service.</summary>
    public const string RobotConfigure = "robot.configure";

    /// <summary>Send a navigation goal by hand.</summary>
    public const string RobotCommand = "robot.command";

    /// <summary>Stop / cancel what a robot is doing. Never implies the right to make it move.</summary>
    public const string RobotStop = "robot.stop";
    public const string RobotManualDrive = "robot.manual.drive";
    public const string RobotMaintenance = "robot.maintenance";
    public const string RobotPower = "robot.power";
    public const string RobotDiagnostics = "robot.diagnostics";
    public const string TrafficRead = "traffic.read";
    public const string TrafficManage = "traffic.manage";
    public const string DispatchOverride = "dispatch.override";

    // Operations
    public const string NotificationRead = "notification.read";
    public const string IssueRead = "issue.read";
    public const string IssueCreate = "issue.create";
    public const string IssueManage = "issue.manage";
    public const string AuditRead = "audit.read";

    // Dashboards
    public const string StatisticsRead = "statistics.read";

    public static IReadOnlyList<string> All { get; } =
    [
        UserManage, ConsoleAccess,
        MapRead, MapWrite,
        WarehouseRead, WarehouseWrite, ContainerCreate, ContainerRecover, VoucherWrite,
        TransportRead, TransportCreate, TransportCancel, TransportReject,
        WorkflowRead, WorkflowWrite, JobRead, JobOperate, JobPause, JobCancel,
        RobotRead, RobotManage, RobotConfigure, RobotCommand, RobotStop, RobotManualDrive,
        RobotMaintenance, RobotPower, RobotDiagnostics, TrafficRead, TrafficManage, DispatchOverride,
        NotificationRead, IssueRead, IssueCreate, IssueManage, AuditRead,
        StatisticsRead
    ];
}

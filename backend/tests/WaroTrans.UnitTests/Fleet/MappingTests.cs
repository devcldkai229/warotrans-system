using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Dispatch;
using WaroTrans.Fleet.Features.Mapping;

namespace WaroTrans.UnitTests.Fleet;

/// <summary>Map building from the web: who may map, the session following the robot's answers, the map coming in.</summary>
public class MappingTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 23, 10, 0, 0, TimeSpan.Zero);

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan delta) => _now += delta;
    }

    private static Robot IdleRobot()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "Robot 01", Now);
        robot.IsOnline = true;
        robot.IsEnabled = true;
        robot.Status = RobotStatus.AVAILABLE;
        return robot;
    }

    [Fact]
    public void An_idle_online_robot_may_map_and_each_blocker_is_named()
    {
        var me = Guid.NewGuid();
        Assert.Empty(MappingService.Blockers(IdleRobot(), Now, me, hasOpenSession: false));

        var robot = IdleRobot();
        robot.IsOnline = false;
        robot.MotionHeld = true;
        robot.CurrentCommandId = Guid.NewGuid();
        robot.ManualLeaseHolderId = Guid.NewGuid();
        robot.ManualLeaseUntil = Now.AddSeconds(20);
        Assert.Equal(
            ["robot_offline", "robot_busy", "robot_motion_held", "robot_manual_mode", "mapping_session_open"],
            MappingService.Blockers(robot, Now, me, hasOpenSession: true));

        // Holding the lease oneself is fine (the mapping page takes it to drive).
        var mine = IdleRobot();
        mine.ManualLeaseHolderId = me;
        mine.ManualLeaseUntil = Now.AddSeconds(20);
        Assert.Empty(MappingService.Blockers(mine, Now, me, hasOpenSession: false));

        // A robot that already reports MAPPING (session lost on the backend side) is not offered either.
        var mapping = IdleRobot();
        mapping.MapVersionCode = "MAPPING";
        Assert.Equal(["mapping_session_open"], MappingService.Blockers(mapping, Now, me, hasOpenSession: false));
    }

    [Fact]
    public void A_robot_that_reports_mapping_is_never_dispatched()
    {
        var robot = IdleRobot();
        robot.MapVersionCode = "MAPPING";
        var query = new DispatchQuery(robot.CurrentMapVersionId, null, null, new HashSet<Guid>()) { MapVersionCode = "MAP-ONE-V019" };
        var candidate = WaroTrans.Fleet.Features.Dispatch.DispatchEligibility.Evaluate(
            robot, query, Now, null, new BatteryOptions { AllowUnknownBatteryDispatch = true }, new DispatchOptions());
        Assert.Contains(DispatchReasons.Mapping, candidate.Reasons);
        Assert.False(candidate.Eligible);
    }

    // ------------------------------------------------------------------ live store

    private static (List<string> Chunks, byte[] Pgm) Chunks(string sessionId, int size, int parts)
    {
        var pgm = new byte[size];
        new Random(7).NextBytes(pgm);
        using var ms = new MemoryStream();
        using (var z = new ZLibStream(ms, CompressionLevel.Optimal, leaveOpen: true)) z.Write(pgm);
        var blob = ms.ToArray();
        var sha = Convert.ToHexString(SHA256.HashData(blob)).ToLowerInvariant();
        var step = (blob.Length + parts - 1) / parts;
        var list = new List<string>();
        for (var i = 0; i < parts; i++)
        {
            var part = blob.Skip(i * step).Take(step).ToArray();
            list.Add(JsonSerializer.Serialize(new
            {
                sessionId, index = i, total = parts, encoding = "zlib+base64", sha256 = sha,
                data = Convert.ToBase64String(part), width = 10, height = 20, resolution = 0.05,
                originX = -1.0, originY = -2.0, originYaw = 0.0, pgmBytes = pgm.Length, yaml = "image: map.pgm\n",
                knownAreaM2 = 12.5, robotPath = "/home/waro/maps/mapping_sessions/s-1"
            }));
        }

        return (list, pgm);
    }

    [Fact]
    public void Chunks_in_any_order_make_the_map_once_all_are_in()
    {
        var store = new MappingLiveStore(new Clock(Now));
        var (chunks, pgm) = Chunks("s-1", 50_000, 3);

        Assert.Null(store.AddChunk(chunks[2]));
        Assert.Null(store.AddChunk(chunks[0]));
        var upload = store.AddChunk(chunks[1]);

        Assert.NotNull(upload);
        Assert.Equal(pgm, upload!.Pgm);
        Assert.Equal("image: map.pgm\n", upload.Yaml);
        Assert.Equal((10, 20, 0.05), (upload.Width, upload.Height, upload.Resolution));
        Assert.Equal((12.5, "/home/waro/maps/mapping_sessions/s-1"), (upload.KnownAreaM2, upload.RobotPath));
    }

    [Fact]
    public void A_map_that_does_not_match_its_checksum_is_refused()
    {
        var store = new MappingLiveStore(new Clock(Now));
        var (chunks, _) = Chunks("s-1", 1000, 1);
        var tampered = chunks[0].Replace("\"sha256\":\"", "\"sha256\":\"00");
        Assert.Throws<InvalidDataException>(() => store.AddChunk(tampered));
    }

    [Fact]
    public void The_live_view_keeps_the_last_map_between_pose_only_messages()
    {
        var clock = new Clock(Now);
        var store = new MappingLiveStore(clock);
        var session = Guid.NewGuid();
        store.PutPreview("RBT-001", JsonSerializer.Serialize(new
        {
            sessionId = session.ToString(), seq = 1, pose = new { x = 1.0, y = 2.0, yaw = 0.0 },
            map = new { width = 2, height = 2, cells = "eJzjAAAABAAB" }
        }));
        clock.Advance(TimeSpan.FromSeconds(1));
        store.PutPreview("RBT-001", JsonSerializer.Serialize(new { sessionId = session.ToString(), seq = 2, pose = new { x = 1.5, y = 2.0, yaw = 0.0 } }));

        var preview = store.GetPreview("RBT-001", session);
        Assert.NotNull(preview);
        Assert.Equal(2, preview!.Seq);
        Assert.Equal(1.5, preview.Pose!.Value.GetProperty("x").GetDouble());
        Assert.NotNull(preview.Map);
        Assert.Equal(Now, preview.MapReceivedAt);
        Assert.Null(store.GetPreview("RBT-001", Guid.NewGuid()));
    }

    // ------------------------------------------------------------------ session following the robot (pure)

    private static MappingSession Open(MappingSessionStatus status, Robot robot) => new()
    {
        Id = Guid.NewGuid(), WarehouseId = robot.WarehouseId, RobotId = robot.Id, RobotCode = robot.Code, Status = status,
        StartedAt = Now, UpdatedAt = Now,
        MappingSince = status == MappingSessionStatus.STARTING ? null : Now,
        StopRequestedAt = status is MappingSessionStatus.SAVING or MappingSessionStatus.CANCELLING ? Now : null
    };

    private static RobotCommand Command(RobotCommandType type, RobotCommandStatus status, string? reason = null, string? error = null, string? result = null)
    {
        var command = RobotCommand.CreateControl(Guid.Empty, Guid.NewGuid(), type, "{}", Now);
        command.Status = status;
        command.RejectReasonCode = reason;
        command.ErrorCode = error;
        command.ResultJson = result;
        command.CompletedAt = status is RobotCommandStatus.SENT or RobotCommandStatus.RUNNING ? null : Now;
        return command;
    }

    [Fact]
    public void Starting_becomes_mapping_when_the_robot_succeeds()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.STARTING, robot);

        Assert.True(MappingService.Advance(session, robot, Command(RobotCommandType.START_MAPPING, RobotCommandStatus.COMPLETED), null, Now));
        Assert.Equal(MappingSessionStatus.MAPPING, session.Status);
        Assert.NotNull(session.MappingSince);
    }

    [Fact]
    public void An_old_gateway_refusing_the_command_fails_the_session_with_a_clear_code()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.STARTING, robot);

        MappingService.Advance(session, robot, Command(RobotCommandType.START_MAPPING, RobotCommandStatus.REJECTED, reason: "UNSUPPORTED_COMMAND"), null, Now);
        Assert.Equal(MappingSessionStatus.FAILED, session.Status);
        Assert.Equal("mapping_unsupported", session.ErrorCode);
    }

    [Fact]
    public void A_start_with_no_answer_times_out()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.STARTING, robot);
        var start = Command(RobotCommandType.START_MAPPING, RobotCommandStatus.RUNNING);

        Assert.False(MappingService.Advance(session, robot, start, null, Now.AddSeconds(10)));
        MappingService.Advance(session, robot, start, null, Now + MappingService.StartTimeout + TimeSpan.FromSeconds(1));
        Assert.Equal("mapping_start_timeout", session.ErrorCode);
    }

    [Fact]
    public void A_failed_save_goes_back_to_mapping_so_the_operator_can_retry()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.SAVING, robot);

        MappingService.Advance(session, robot, null, Command(RobotCommandType.STOP_MAPPING, RobotCommandStatus.FAILED, error: "MAPPING_UPLOAD_FAILED"), Now);
        Assert.Equal(MappingSessionStatus.MAPPING, session.Status);
        Assert.Equal("MAPPING_UPLOAD_FAILED", session.ErrorCode);
    }

    [Fact]
    public void A_save_the_robot_finished_waits_for_the_map_then_gives_up()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.SAVING, robot);
        var stop = Command(RobotCommandType.STOP_MAPPING, RobotCommandStatus.COMPLETED,
            result: "{\"sessionId\":\"x\",\"saved\":true,\"robotPath\":\"/home/waro/maps/mapping_sessions/x\",\"knownAreaM2\":41.5}");

        Assert.False(MappingService.Advance(session, robot, null, stop, Now.AddSeconds(5)));
        Assert.Equal(MappingSessionStatus.SAVING, session.Status);
        Assert.Equal("/home/waro/maps/mapping_sessions/x", session.RobotPath);
        Assert.Equal(41.5, session.KnownAreaM2);

        MappingService.Advance(session, robot, null, stop, Now.AddSeconds(61));
        Assert.Equal("mapping_upload_incomplete", session.ErrorCode);
        Assert.Contains("/home/waro/maps/mapping_sessions/x", session.ErrorMessage);
    }

    [Fact]
    public void A_cancel_the_robot_carried_out_closes_the_session()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.CANCELLING, robot);

        MappingService.Advance(session, robot, null, Command(RobotCommandType.STOP_MAPPING, RobotCommandStatus.COMPLETED, result: "{\"saved\":false}"), Now);
        Assert.Equal(MappingSessionStatus.CANCELLED, session.Status);
        Assert.NotNull(session.EndedAt);
    }

    [Fact]
    public void A_robot_that_restarted_is_not_mapping_any_more()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.MAPPING, robot);
        robot.MapVersionCode = "MAPPING";
        robot.LastTelemetryAt = Now.AddSeconds(60);
        Assert.False(MappingService.Advance(session, robot, null, null, Now.AddSeconds(60)));

        robot.MapVersionCode = "MAP-ONE-V019";
        MappingService.Advance(session, robot, null, null, Now.AddSeconds(61));
        Assert.Equal(MappingSessionStatus.FAILED, session.Status);
        Assert.Equal("mapping_lost", session.ErrorCode);
    }

    [Fact]
    public void A_robot_offline_for_long_loses_the_session_but_a_short_drop_does_not()
    {
        var robot = IdleRobot();
        var session = Open(MappingSessionStatus.MAPPING, robot);
        robot.IsOnline = false;
        robot.LastHeartbeatAt = Now;

        Assert.False(MappingService.Advance(session, robot, null, null, Now.AddMinutes(2)));
        MappingService.Advance(session, robot, null, null, Now + MappingService.OfflineGiveUpAfter + TimeSpan.FromSeconds(1));
        Assert.Equal("robot_offline", session.ErrorCode);
    }
}

using System.Text.Json;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.RobotControl;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.UnitTests.Fleet;

/// <summary>AUTO_LOCALIZE: which places the robot checks, when the backend asks again, and what the robot answered.</summary>
public class AutoLocalizeTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 23, 10, 0, 0, TimeSpan.Zero);

    private static EndpointPoseWithType Endpoint(string code, bool enabled = true) =>
        new(Guid.NewGuid(), code, code, EndpointType.WAYPOINT, enabled, 1.0, 2.0, 0.25, 1.57);

    [Fact]
    public void Candidates_are_the_last_pose_then_home_then_the_other_enabled_endpoints()
    {
        var last = new RobotPoseSample { X = 0.4, Y = -1.5, Yaw = 1.6, MapVersionCode = "MAP-ONE-V019" };
        var endpoints = new[] { Endpoint("EP-SHELF"), Endpoint("EP-OFF", enabled: false), Endpoint("EP-PARKING-A"), Endpoint("EP-CHARGE") };

        var candidates = RobotControlService.BuildCandidates(last, endpoints, "EP-PARKING-A");

        Assert.Equal(["LAST_POSE", "HOME", "ENDPOINT", "ENDPOINT"], candidates.Select(c => c.Source));
        Assert.Equal([null, "EP-PARKING-A", "EP-CHARGE", "EP-SHELF"], candidates.Select(c => c.EndpointCode));
        Assert.Equal(0.4, candidates[0].X);
    }

    [Fact]
    public void Without_a_pose_on_this_map_or_a_home_only_endpoints_are_checked()
    {
        var candidates = RobotControlService.BuildCandidates(null, [Endpoint("EP-B"), Endpoint("EP-A")], null);

        Assert.All(candidates, c => Assert.Equal("ENDPOINT", c.Source));
        Assert.Equal(["EP-A", "EP-B"], candidates.Select(c => c.EndpointCode));
    }

    private static Robot RobotOnMap(Guid mapId) =>
        Robot.Register(Guid.NewGuid(), mapId, "RBT-001", "Robot 01", Now);

    private static RobotCommand Run(Robot robot, Guid mapId, DateTimeOffset issuedAt, RobotCommandStatus status)
    {
        var payload = JsonSerializer.Serialize(new { allowSpin = false, trigger = "AUTO", mapVersionId = mapId });
        var command = RobotCommand.CreateControl(robot.Id, Guid.NewGuid(), RobotCommandType.AUTO_LOCALIZE, payload, issuedAt);
        command.Status = status;
        return command;
    }

    [Fact]
    public void The_first_automatic_run_is_due_at_once()
    {
        var robot = RobotOnMap(Guid.NewGuid());
        Assert.True(AutoLocalizeHostedService.Due(null, robot, Now, new AutoLocalizeOptions()));
    }

    [Fact]
    public void A_running_run_is_waited_for_and_a_failed_one_is_not_retried_soon()
    {
        var map = Guid.NewGuid();
        var robot = RobotOnMap(map);
        var settings = new AutoLocalizeOptions { RetryAfterSeconds = 60, RetryAfterFailureSeconds = 600 };

        Assert.False(AutoLocalizeHostedService.Due(Run(robot, map, Now.AddSeconds(-30), RobotCommandStatus.RUNNING), robot, Now, settings));
        Assert.False(AutoLocalizeHostedService.Due(Run(robot, map, Now.AddSeconds(-120), RobotCommandStatus.FAILED), robot, Now, settings));
        Assert.True(AutoLocalizeHostedService.Due(Run(robot, map, Now.AddSeconds(-601), RobotCommandStatus.FAILED), robot, Now, settings));
        Assert.True(AutoLocalizeHostedService.Due(Run(robot, map, Now.AddSeconds(-61), RobotCommandStatus.COMPLETED), robot, Now, settings));
    }

    [Fact]
    public void A_new_map_is_tried_at_once_whatever_happened_on_the_old_one()
    {
        var robot = RobotOnMap(Guid.NewGuid());
        var onOldMap = Run(robot, Guid.NewGuid(), Now.AddSeconds(-5), RobotCommandStatus.FAILED);

        Assert.True(AutoLocalizeHostedService.Due(onOldMap, robot, Now, new AutoLocalizeOptions()));
    }

    [Fact]
    public void A_run_never_asked_reads_as_none()
    {
        var status = RobotControlService.ToAutoLocalizeStatus(Guid.NewGuid(), null);
        Assert.Equal("NONE", status.State);
        Assert.Empty(status.Suggestions);
    }

    [Fact]
    public void A_sure_match_reads_with_its_pose_and_method()
    {
        var robot = RobotOnMap(Guid.NewGuid());
        var command = Run(robot, robot.CurrentMapVersionId, Now, RobotCommandStatus.RUNNING);
        command.TryApplyResult("SUCCEEDED", null, Now.AddSeconds(3));
        command.ResultJson = """
            {"method":"CANDIDATE_MATCH","reason":"MATCHED","score":0.93,"margin":0.31,"endpointCode":"EP-PARKING-A",
             "x":-0.52,"y":-1.56,"yaw":1.57,"suggestions":[{"x":-0.52,"y":-1.56,"yaw":1.57,"score":0.93,"endpointCode":"EP-PARKING-A","source":"HOME"}]}
            """;

        var status = RobotControlService.ToAutoLocalizeStatus(robot.Id, command);

        Assert.Equal("SUCCEEDED", status.State);
        Assert.Equal("CANDIDATE_MATCH", status.Method);
        Assert.Equal("EP-PARKING-A", status.EndpointCode);
        Assert.Equal(-0.52, status.X);
        Assert.Equal("AUTO", status.Trigger);
        Assert.Single(status.Suggestions);
    }

    [Fact]
    public void An_unsure_answer_reads_as_failed_with_its_suggestions()
    {
        var robot = RobotOnMap(Guid.NewGuid());
        var command = Run(robot, robot.CurrentMapVersionId, Now, RobotCommandStatus.RUNNING);
        command.TryApplyResult("FAILED", "LOCALIZATION_AMBIGUOUS", Now.AddSeconds(3));
        command.ResultJson = """
            {"method":"NONE","reason":"AMBIGUOUS","score":0.8,"margin":0.02,"endpointCode":"EP-A",
             "suggestions":[{"x":1,"y":2,"yaw":0,"score":0.8,"endpointCode":"EP-A","source":"ENDPOINT"},
                            {"x":3,"y":2,"yaw":3.1,"score":0.78,"endpointCode":null,"source":"GLOBAL"}]}
            """;

        var status = RobotControlService.ToAutoLocalizeStatus(robot.Id, command);

        Assert.Equal("FAILED", status.State);
        Assert.Equal("LOCALIZATION_AMBIGUOUS", status.ErrorCode);
        Assert.Null(status.X);
        Assert.Equal(["EP-A", null], status.Suggestions.Select(s => s.EndpointCode));
        Assert.Equal("GLOBAL", status.Suggestions[1].Source);
    }
}

using WaroTrans.Fleet.Features.Shared;

namespace WaroTrans.Fleet.Features.ListRobots;

public sealed record ListRobotsResponse(IReadOnlyList<RobotResponse> Items, int Total);

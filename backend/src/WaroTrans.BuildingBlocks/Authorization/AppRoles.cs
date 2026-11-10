namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>Role names as they travel in the access token. Must match Identity's <c>AccountRole</c> enum.</summary>
public static class AppRoles
{
    public const string Admin = "ADMIN";
    public const string Staff = "STAFF";

    /// <summary>Diagnoses, stops and drives robots it is assigned to; no warehouse or account rights.</summary>
    public const string Technician = "TECHNICIAN";

    public static IReadOnlyList<string> All { get; } = [Admin, Staff, Technician];

    /// <summary>Only a Technician is limited to the robots assigned to the account (IRobotAccessScope).</summary>
    public static bool IsRobotScoped(string role) => role == Technician;
}

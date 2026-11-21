using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Features.CreateWorkflow;
using WaroTrans.WorkflowExecution.Features.CreateWorkflowVersion;
using WaroTrans.WorkflowExecution.Features.PublishWorkflow;
using WaroTrans.WorkflowExecution.Features.UpdateWorkflow;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Seeding;

// Workflow seed from JSON files (one per workflow, the shape of POST /api/workflow-execution/workflows).
//
//   dotnet run --project backend/tools/WorkflowSeed -- [--dir backend/seed/workflows] [--dry-run] [--new-version]
//                                                       [--database warotrans_test]
//   dotnet run --project backend/tools/WorkflowSeed -- --export <dir>      (database -> JSON files)
//
// Seeding leaves DRAFTs: an administrator fills the ADMIN_INPUT values (inspection point, gates, parking group) in the
// workflow editor and publishes. A code that already exists is not overwritten (see StandardWorkflowSeeder).
// Connection: env ConnectionStrings__PostgreSQL, else the local docker database. Only a local development or test
// database is accepted: this tool must never touch production.

var dryRun = args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase);
var draftNewVersion = args.Contains("--new-version", StringComparer.OrdinalIgnoreCase);
var exportDir = Arg("--export");
var seedDir = Arg("--dir") ?? FindSeedDirectory();
var databaseArg = Arg("--database");
var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
    ?? "Host=127.0.0.1;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";
var builder = new NpgsqlConnectionStringBuilder(connectionString);
if (databaseArg is not null)
{
    builder.Database = databaseArg;
}

string[] localHosts = ["127.0.0.1", "localhost", "::1"];
string[] allowedDatabases = ["warotrans", "warotrans_test", "warotrans_dev"];
if (!localHosts.Contains(builder.Host, StringComparer.OrdinalIgnoreCase)
    || !(allowedDatabases.Contains(builder.Database, StringComparer.Ordinal) || builder.Database?.EndsWith("_test", StringComparison.Ordinal) == true))
{
    Console.Error.WriteLine($"Refused: {builder.Host}/{builder.Database} is not a local development or test database.");
    return 2;
}

// The seed is recorded as made by the development admin (IdentityDevelopmentSeeder), like the existing INBOUND.
var seedAccount = Guid.Parse("a0000000-0000-4000-8000-000000000001");

var services = new ServiceCollection();
services.AddLogging();
services.AddDbContext<WorkflowExecutionDbContext>(o => o.UseNpgsql(builder.ConnectionString));
services.AddSingleton<ICurrentUser>(new SeedUser(seedAccount));
services.AddSingleton<IAuditTrail, ConsoleAuditTrail>();
services.AddScoped<CreateWorkflowHandler>();
services.AddScoped<UpdateWorkflowHandler>();
services.AddScoped<CreateWorkflowVersionHandler>();
services.AddScoped<PublishWorkflowHandler>();
services.AddScoped<StandardWorkflowSeeder>();

await using var provider = services.BuildServiceProvider();
await using var scope = provider.CreateAsyncScope();

if (exportDir is not null)
{
    var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
    var all = await db.Workflows.AsNoTracking().Include(w => w.Tasks).ThenInclude(t => t.Steps).ToListAsync();
    Directory.CreateDirectory(exportDir);
    foreach (var latest in all.GroupBy(w => w.Code).Select(g => g.OrderByDescending(w => w.VersionNo).First()).OrderBy(w => w.Code))
    {
        var file = Path.Combine(exportDir, $"{latest.Code}.json");
        await File.WriteAllTextAsync(file, WorkflowSeedJson.Write(latest));
        Console.WriteLine($"  {latest.Code,-22} v{latest.VersionNo} {latest.Status,-9} -> {file}");
    }

    return 0;
}

if (seedDir is null)
{
    Console.Error.WriteLine("No seed directory: pass --dir <path> (default backend/seed/workflows, looked up from the current directory).");
    return 2;
}

IReadOnlyList<WaroTrans.WorkflowExecution.Features.Shared.UpsertWorkflowRequest> definitions;
try
{
    definitions = WorkflowSeedJson.ReadDirectory(seedDir);
}
catch (WorkflowSeedFileException error)
{
    Console.Error.WriteLine($"Seed file rejected: {error.Message}");
    return 3;
}

var seeder = scope.ServiceProvider.GetRequiredService<StandardWorkflowSeeder>();
Console.WriteLine($"{(dryRun ? "Dry run on" : "Seeding")} {builder.Host}:{builder.Port}/{builder.Database} from {seedDir} ({definitions.Count} files)");
foreach (var outcome in await seeder.SeedAsync(definitions, new WorkflowSeedOptions(dryRun, draftNewVersion), CancellationToken.None))
{
    Console.WriteLine($"  {outcome.Code,-22} v{outcome.VersionNo} {outcome.Status,-9} {outcome.WorkflowId}  {outcome.Action}");
}

return 0;

static string? FindSeedDirectory()
{
    for (var dir = new DirectoryInfo(Directory.GetCurrentDirectory()); dir is not null; dir = dir.Parent)
    {
        foreach (var candidate in new[] { Path.Combine(dir.FullName, "backend", "seed", "workflows"), Path.Combine(dir.FullName, "seed", "workflows") })
        {
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }
    }

    return null;
}

string? Arg(string name)
{
    var i = Array.FindIndex(args, a => string.Equals(a, name, StringComparison.OrdinalIgnoreCase));
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

internal sealed class SeedUser(Guid accountId) : ICurrentUser
{
    public Guid? AccountId { get; } = accountId;
    public string? Username => "workflow-seed";
    public string? Role => "Admin";
    public bool IsAuthenticated => true;
}

/// <summary>The tool has no Mongo audit log: a seed is printed to the console instead.</summary>
internal sealed class ConsoleAuditTrail : IAuditTrail
{
    public Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    {
        Console.WriteLine($"    audit {entry.Action} {entry.EntityType} {entry.EntityId}");
        return Task.CompletedTask;
    }
}

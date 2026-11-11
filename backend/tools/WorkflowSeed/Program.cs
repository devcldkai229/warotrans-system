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

// Seeds OUTBOUND_RETRIEVAL and INTERNAL_RELOCATION (DRAFT -> validate -> PUBLISH), repeatable.
//
//   dotnet run --project backend/tools/WorkflowSeed -- [--dry-run] [--database warotrans_test]
//
// Connection: env ConnectionStrings__PostgreSQL, else the local docker database. Only a local development or test
// database is accepted: this tool must never touch production.

var dryRun = args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase);
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
services.AddScoped<CreateWorkflowHandler>();
services.AddScoped<UpdateWorkflowHandler>();
services.AddScoped<CreateWorkflowVersionHandler>();
services.AddScoped<PublishWorkflowHandler>();
services.AddScoped<StandardWorkflowSeeder>();

await using var provider = services.BuildServiceProvider();
await using var scope = provider.CreateAsyncScope();
var seeder = scope.ServiceProvider.GetRequiredService<StandardWorkflowSeeder>();

Console.WriteLine($"{(dryRun ? "Dry run on" : "Seeding")} {builder.Host}:{builder.Port}/{builder.Database}");
foreach (var outcome in await seeder.SeedAsync(dryRun, CancellationToken.None))
{
    Console.WriteLine($"  {outcome.Code,-22} v{outcome.VersionNo} {outcome.Status,-9} {outcome.WorkflowId}  {outcome.Action}");
}

return 0;

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

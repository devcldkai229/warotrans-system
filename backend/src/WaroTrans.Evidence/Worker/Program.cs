using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Persistence;

// Evidence Worker (docs/adr/0012). Asynchronous work only: no public API, no migrations (the Recorder owns them).
var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Evidence")
    ?? throw new InvalidOperationException("ConnectionStrings:Evidence is required.");
builder.Services.AddDbContext<EvidenceDbContext>(o => o.UseNpgsql(connectionString, npgsql => npgsql
    .MigrationsHistoryTable("__ef_migrations_history", EvidenceDbContext.Schema)));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: "evidence-postgresql");

var app = builder.Build();

// Internal port only (5096); nothing but health is served.
app.MapHealthChecks("/health");

app.Run();

public partial class Program;

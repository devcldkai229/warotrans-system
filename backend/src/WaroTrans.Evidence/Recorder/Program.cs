using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder;
using WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;
using WaroTrans.Evidence.Recorder.Features.Edge.WhoAmI;
using WaroTrans.Evidence.Recorder.Features.Integrations.IngestTransportEvents;
using WaroTrans.Evidence.Recorder.Features.Journals;
using WaroTrans.Evidence.Recorder.Features.Journals.GetJournal;
using WaroTrans.Evidence.Recorder.Features.Journals.ReconcileWithTransport;
using WaroTrans.Evidence.Recorder.Features.Runs;
using WaroTrans.Evidence.Recorder.Services;

// Evidence Recorder (docs/adr/0012): Transport Journal API, recording metadata, upload grants. A process of its own:
// a slow or failing Evidence never slows dispatch, and dispatch never waits for Evidence.
var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 8 * 1024 * 1024);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

var section = builder.Configuration.GetSection(RecorderOptions.SectionName);
builder.Services.Configure<RecorderOptions>(section);
var recorderOptions = section.Get<RecorderOptions>() ?? new RecorderOptions();
if (recorderOptions.ServiceToken.Length < RecorderOptions.MinimumServiceTokenLength)
{
    throw new InvalidOperationException(
        $"{RecorderOptions.SectionName}:ServiceToken must be at least {RecorderOptions.MinimumServiceTokenLength} characters (the same as EvidenceBridge:ServiceToken of the Host).");
}

var connectionString = builder.Configuration.GetConnectionString("Evidence")
    ?? throw new InvalidOperationException("ConnectionStrings:Evidence is required.");
builder.Services.AddDbContext<EvidenceDbContext>(o => o.UseNpgsql(connectionString, npgsql => npgsql
    .MigrationsAssembly(RecorderOptions.MigrationsAssembly)
    .MigrationsHistoryTable("__ef_migrations_history", EvidenceDbContext.Schema)));

builder.Services.AddMemoryCache();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddHttpClient<CoreApiClient>(client =>
{
    client.BaseAddress = new Uri(recorderOptions.CoreBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddScoped<RobotVisibility>();
builder.Services.AddScoped<AccessAuditWriter>();
builder.Services.AddScoped<RunUpserter>();
builder.Services.AddScoped<JournalStatusService>();
builder.Services.AddScoped<IngestTransportEventsHandler>();
builder.Services.AddHostedService<JournalMaintenanceService>();

// Users: the same access tokens the Host issues. Robots: their own recording credential.
builder.Services.AddWaroTransJwtAuthentication(builder.Configuration);
builder.Services.AddAuthentication()
    .AddScheme<AuthenticationSchemeOptions, RobotAuthenticationHandler>(RobotAuthenticationHandler.SchemeName, null);
builder.Services.AddPermissionAuthorization();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(RobotAuthenticationHandler.Policy, policy => policy
        .AddAuthenticationSchemes(RobotAuthenticationHandler.SchemeName)
        .RequireClaim(RobotAuthenticationHandler.RobotCodeClaim));
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
});

builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: "evidence-postgresql");
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseExceptionHandler();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<EvidenceDbContext>().Database.MigrateAsync();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
var api = app.MapGroup("/api/evidence").WithTags("Evidence");
IngestTransportEventsEndpoint.Map(api);
GetJournalEndpoints.Map(api);
IssueRobotCredentialEndpoint.Map(api);
WhoAmIEndpoint.Map(api);

app.Run();

public partial class Program;

using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using System.Threading.RateLimiting;
using WaroTrans.Evidence;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Features.Edge.Recordings;
using WaroTrans.Evidence.Recorder.Features.Edge.Telemetry;
using WaroTrans.Evidence.Recorder.Features.LocalStore;
using WaroTrans.Evidence.Recorder.Features.Playback;
using WaroTrans.Evidence.Storage;
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
void EvidenceDb(DbContextOptionsBuilder o) => o.UseNpgsql(connectionString, npgsql => npgsql
    .MigrationsAssembly(RecorderOptions.MigrationsAssembly)
    .MigrationsHistoryTable("__ef_migrations_history", EvidenceDbContext.Schema));
// One registration: the factory (singletons such as the Local queue need it) and a scoped context made by it.
builder.Services.AddDbContextFactory<EvidenceDbContext>(EvidenceDb);
builder.Services.AddScoped(sp => sp.GetRequiredService<IDbContextFactory<EvidenceDbContext>>().CreateDbContext());
builder.Services.AddEvidenceStorage(builder.Configuration);
builder.Services.AddEvidenceQueues(builder.Configuration);
var storageOptions = builder.Configuration.GetSection(EvidenceStorageOptions.SectionName).Get<EvidenceStorageOptions>() ?? new EvidenceStorageOptions();

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

// Playback grants: CloudFront signed URL/cookies (AWS) or the Recorder serving HLS from the local store (dev).
builder.Services.Configure<PlaybackOptions>(builder.Configuration.GetSection(PlaybackOptions.SectionName));
var playbackProvider = builder.Configuration.GetSection(PlaybackOptions.SectionName)["Provider"] ?? "Local";
var localPlayback = !string.Equals(playbackProvider, "CloudFront", StringComparison.OrdinalIgnoreCase);
if (localPlayback)
{
    builder.Services.AddSingleton<LocalPlaybackSigner>();
    builder.Services.AddSingleton<IPlaybackSigner>(sp => sp.GetRequiredService<LocalPlaybackSigner>());
}
else
{
    builder.Services.AddSingleton<IPlaybackSigner, CloudFrontPlaybackSigner>();
}

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

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Per robot: telemetry batches, grants and heartbeats, far above what one robot needs in normal running.
    options.AddPolicy(EdgeRateLimit, context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.RobotCode() ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1) }));
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
app.UseRateLimiter();

app.MapHealthChecks("/health").AllowAnonymous();
var api = app.MapGroup("/api/evidence").WithTags("Evidence");
IngestTransportEventsEndpoint.Map(api);
GetJournalEndpoints.Map(api);
IssueRobotCredentialEndpoint.Map(api);
var edge = api.MapGroup("/edge")
    .RequireAuthorization(RobotAuthenticationHandler.Policy)
    .RequireRateLimiting(EdgeRateLimit);
WhoAmIEndpoint.Map(edge);
RecordingEndpoints.Map(edge);
TelemetryEndpoints.Map(edge);
PlaybackEndpoints.Map(api);
if (localPlayback)
{
    LocalPlaybackEndpoint.Map(app);
}
if (!storageOptions.IsS3)
{
    LocalStoreEndpoint.Map(app);
}

app.Run();

public partial class Program
{
    private const string EdgeRateLimit = "evidence-edge";
}

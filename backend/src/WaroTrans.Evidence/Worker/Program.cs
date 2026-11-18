using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Worker.Features.MediaConvertResult;
using WaroTrans.Evidence.Worker.Features.MediaConvertSubmission;
using WaroTrans.Evidence.Worker.Features.OutboxPublisher;
using WaroTrans.Evidence.Worker.Features.Reconciliation;
using WaroTrans.Evidence.Worker.Features.SegmentIngestion;
using WaroTrans.Evidence.Worker.Services;

// Evidence Worker (docs/adr/0012). Asynchronous work only: no public API, no migrations (the Recorder owns them),
// never references the Recorder. Scales on its own: several replicas share the queues and claim rows with SKIP LOCKED.
var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Evidence")
    ?? throw new InvalidOperationException("ConnectionStrings:Evidence is required.");
void EvidenceDb(DbContextOptionsBuilder o) =>
    o.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", EvidenceDbContext.Schema));
// One registration: the factory (singletons such as the Local queue need it) and a scoped context made by it.
builder.Services.AddDbContextFactory<EvidenceDbContext>(EvidenceDb);
builder.Services.AddScoped(sp => sp.GetRequiredService<IDbContextFactory<EvidenceDbContext>>().CreateDbContext());
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<WorkerOptions>(builder.Configuration.GetSection(WorkerOptions.SectionName));
builder.Services.AddEvidenceStorage(builder.Configuration);
builder.Services.AddEvidenceQueues(builder.Configuration);

builder.Services.AddScoped<SegmentIngestionHandler>();
builder.Services.AddHostedService<QueueConsumer<SegmentIngestionHandler>>();
builder.Services.AddHostedService<EvidenceOutboxPublisher>();
builder.Services.AddHostedService<IngestReconciliation>();

// Transcoding: MediaConvert (AWS), ffmpeg (development) or None (jobs stay QUEUED until a provider is configured).
builder.Services.Configure<EvidenceMediaOptions>(builder.Configuration.GetSection(EvidenceMediaOptions.SectionName));
var mediaProvider = builder.Configuration.GetSection(EvidenceMediaOptions.SectionName)["Provider"] ?? "None";
if (!string.Equals(mediaProvider, "None", StringComparison.OrdinalIgnoreCase))
{
    if (string.Equals(mediaProvider, "MediaConvert", StringComparison.OrdinalIgnoreCase))
    {
        builder.Services.AddSingleton<IMediaTranscoder, MediaConvertTranscoder>();
    }
    else
    {
        builder.Services.AddSingleton<IMediaTranscoder, LocalFfmpegTranscoder>();
    }

    builder.Services.AddScoped<MediaSubmissionHandler>();
    builder.Services.AddScoped<MediaResultHandler>();
    builder.Services.AddHostedService<QueueConsumer<MediaSubmissionHandler>>();
    builder.Services.AddHostedService<QueueConsumer<MediaResultHandler>>();
    builder.Services.AddHostedService<MediaReconciliation>();
}

builder.Services.AddHealthChecks().AddNpgSql(connectionString, name: "evidence-postgresql");

var app = builder.Build();

// Internal port only (5096); nothing but health is served.
app.MapHealthChecks("/health");

app.Run();

public partial class Program;

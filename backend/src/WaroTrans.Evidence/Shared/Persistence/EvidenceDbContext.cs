using System.Text;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;

namespace WaroTrans.Evidence.Persistence;

/// <summary>
/// The Evidence database (warotrans_evidence, schema <c>evidence</c>). Owned by the Evidence bounded context; nothing
/// in it points into the monolith's database. Migrations live in the Recorder only; the Worker uses this mapping with
/// restricted rights and never migrates.
/// </summary>
public sealed class EvidenceDbContext(DbContextOptions<EvidenceDbContext> options) : DbContext(options)
{
    public const string Schema = "evidence";

    public DbSet<EvidenceJournal> Journals => Set<EvidenceJournal>();
    public DbSet<RobotRunEvidence> Runs => Set<RobotRunEvidence>();
    public DbSet<CameraRecording> Recordings => Set<CameraRecording>();
    public DbSet<RecordingContinuityGroup> ContinuityGroups => Set<RecordingContinuityGroup>();
    public DbSet<VideoSegment> Segments => Set<VideoSegment>();
    public DbSet<TrajectoryPoint> TrajectoryPoints => Set<TrajectoryPoint>();
    public DbSet<RoutePlanSnapshot> RoutePlans => Set<RoutePlanSnapshot>();
    public DbSet<EvidenceEvent> Events => Set<EvidenceEvent>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<MediaProcessingJob> ProcessingJobs => Set<MediaProcessingJob>();
    public DbSet<PlaybackSpan> PlaybackSpans => Set<PlaybackSpan>();
    public DbSet<EvidenceAnnotation> Annotations => Set<EvidenceAnnotation>();
    public DbSet<EvidenceAccessAudit> AccessAudits => Set<EvidenceAccessAudit>();
    public DbSet<EvidenceInbox> Inbox => Set<EvidenceInbox>();
    public DbSet<EvidenceOutbox> Outbox => Set<EvidenceOutbox>();
    public DbSet<ClockAnchor> ClockAnchors => Set<ClockAnchor>();
    public DbSet<RobotCredential> RobotCredentials => Set<RobotCredential>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(EvidenceDbContext).Assembly);
        ApplyNaming(modelBuilder);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Evidence statuses are stored by name, readable in SQL and stable across enum reordering.
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    /// <summary>snake_case columns; pk_/fk_/ix_ constraint names.</summary>
    private static void ApplyNaming(ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var table = entity.GetTableName()!;
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(Snake(property.Name));
            }

            foreach (var key in entity.GetKeys().Where(k => k.IsPrimaryKey()))
            {
                key.SetName($"pk_{table}");
            }

            foreach (var fk in entity.GetForeignKeys())
            {
                var columns = string.Join("_", fk.Properties.Select(p => Snake(p.Name)));
                fk.SetConstraintName($"fk_{table}_{columns}");
            }

            foreach (var index in entity.GetIndexes())
            {
                if (index.GetDatabaseName() is { } name && name.StartsWith("ux_", StringComparison.Ordinal))
                {
                    continue; // named on purpose in its configuration
                }

                var columns = string.Join("_", index.Properties.Select(p => Snake(p.Name)));
                index.SetDatabaseName($"{(index.IsUnique ? "ux" : "ix")}_{table}_{columns}");
            }
        }
    }

    public static string Snake(string name)
    {
        name = name.Replace("ETag", "Etag", StringComparison.Ordinal);
        var builder = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0 && (char.IsLower(name[i - 1]) || char.IsDigit(name[i - 1])
                              || (i + 1 < name.Length && char.IsLower(name[i + 1]) && char.IsUpper(name[i - 1]))))
                {
                    builder.Append('_');
                }

                builder.Append(char.ToLowerInvariant(c));
            }
            else
            {
                builder.Append(c);
            }
        }

        return builder.ToString();
    }
}

using Amazon;
using Amazon.MediaConvert;
using Amazon.MediaConvert.Model;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Media;

namespace WaroTrans.Evidence.Worker.Services;

/// <summary>
/// AWS Elemental MediaConvert (spec §9.4): inputs stitched in sequence order (at most 150 per job, guaranteed by the
/// continuity groups), profile hls-v1 = H.264 HLS 720p + 480p, 6 s chunks, source frame rate kept (the PlaybackSpan
/// mapping relies on it). The client request token only dedupes about a minute at AWS: the processing job row is the
/// real guard, and <see cref="FindAsync"/> adopts a job submitted before a crash instead of submitting it twice.
/// </summary>
public sealed class MediaConvertTranscoder(IOptions<EvidenceMediaOptions> options, IOptions<EvidenceAwsOptions> aws) : IMediaTranscoder
{
    private AmazonMediaConvertClient? _client;

    public string Provider => "AWS_MEDIACONVERT";

    private Task<AmazonMediaConvertClient> ClientAsync(CancellationToken cancellationToken)
    {
        if (_client is null)
        {
            // The regional endpoint serves every account (account endpoints / DescribeEndpoints are no longer needed).
            var o = options.Value;
            var config = new AmazonMediaConvertConfig { RegionEndpoint = RegionEndpoint.GetBySystemName(o.Region) };
            if (!string.IsNullOrWhiteSpace(o.MediaConvertEndpoint))
            {
                config.ServiceURL = o.MediaConvertEndpoint;
                config.AuthenticationRegion = o.Region;
            }

            var credentials = aws.Value.Credentials();
            _client = credentials is null ? new AmazonMediaConvertClient(config) : new AmazonMediaConvertClient(credentials, config);
        }

        _ = cancellationToken;
        return Task.FromResult(_client);
    }

    public async Task<string> SubmitAsync(TranscodeRequest r, CancellationToken cancellationToken)
    {
        var o = options.Value;
        var client = await ClientAsync(cancellationToken);
        var response = await client.CreateJobAsync(new CreateJobRequest
        {
            Queue = o.MediaConvertQueueArn,
            Role = o.MediaConvertRoleArn,
            ClientRequestToken = r.RequestToken,
            UserMetadata = new Dictionary<string, string>
            {
                [MediaJobEvents.ProcessingJobIdKey] = r.ProcessingJobId.ToString(),
                ["mediaAssetId"] = r.MediaAssetId.ToString(),
                ["inputManifestSha256"] = r.InputManifestSha256,
                ["profile"] = r.ProfileVersion
            },
            Tags = new Dictionary<string, string> { ["Component"] = "Evidence" },
            Settings = Settings(r, Math.Max(2, o.HlsSegmentSeconds))
        }, cancellationToken);
        return response.Job.Id;
    }

    /// <summary>Profile hls-v1. Changing it means a new profile version (and a new PlaybackSpan check).</summary>
    internal static JobSettings Settings(TranscodeRequest r, int segmentSeconds) => new()
    {
        TimecodeConfig = new TimecodeConfig { Source = TimecodeSource.ZEROBASED },
        Inputs = r.InputKeys.Select(k => new Input
        {
            FileInput = $"s3://{r.InputBucket}/{k}",
            TimecodeSource = InputTimecodeSource.ZEROBASED,
            VideoSelector = new VideoSelector()
        }).ToList(),
        OutputGroups =
        [
            new OutputGroup
            {
                Name = "HLS",
                OutputGroupSettings = new OutputGroupSettings
                {
                    Type = OutputGroupType.HLS_GROUP_SETTINGS,
                    HlsGroupSettings = new HlsGroupSettings
                    {
                        Destination = $"s3://{r.OutputBucket}/{r.OutputPrefix}master",
                        SegmentLength = segmentSeconds,
                        MinSegmentLength = 0,
                        SegmentControl = HlsSegmentControl.SEGMENTED_FILES,
                        DirectoryStructure = HlsDirectoryStructure.SINGLE_DIRECTORY,
                        ManifestDurationFormat = HlsManifestDurationFormat.FLOATING_POINT,
                        OutputSelection = HlsOutputSelection.MANIFESTS_AND_SEGMENTS
                    }
                },
                Outputs = [Rendition("_720p", 720, 2_500_000, r.Fps), Rendition("_480p", 480, 1_000_000, r.Fps)]
            }
        ]
    };

    private static Output Rendition(string modifier, int height, int maxBitrate, int fps) => new()
    {
        NameModifier = modifier,
        ContainerSettings = new ContainerSettings { Container = ContainerType.M3U8 },
        VideoDescription = new VideoDescription
        {
            Height = height,
            ScalingBehavior = ScalingBehavior.DEFAULT,
            CodecSettings = new VideoCodecSettings
            {
                Codec = VideoCodec.H_264,
                H264Settings = new H264Settings
                {
                    RateControlMode = H264RateControlMode.QVBR,
                    MaxBitrate = maxBitrate,
                    QvbrSettings = new H264QvbrSettings { QvbrQualityLevel = 7 },
                    // Source frame rate kept: media time stays the capture clock's slots (PlaybackSpan CFR_SLOT_V1).
                    FramerateControl = H264FramerateControl.INITIALIZE_FROM_SOURCE,
                    GopSize = 2,
                    GopSizeUnits = H264GopSizeUnits.SECONDS,
                    SceneChangeDetect = H264SceneChangeDetect.DISABLED,
                    CodecProfile = H264CodecProfile.MAIN
                }
            }
        }
    };

    public async Task<ProviderJob?> FindAsync(Guid processingJobId, CancellationToken cancellationToken)
    {
        var client = await ClientAsync(cancellationToken);
        var list = await client.ListJobsAsync(new ListJobsRequest
        {
            Queue = options.Value.MediaConvertQueueArn,
            MaxResults = 20,
            Order = Order.DESCENDING
        }, cancellationToken);
        var job = list.Jobs?.FirstOrDefault(j => j.UserMetadata is not null
                                                 && j.UserMetadata.TryGetValue(MediaJobEvents.ProcessingJobIdKey, out var id)
                                                 && id == processingJobId.ToString());
        return job is null ? null : ToProviderJob(job);
    }

    public async Task<ProviderJob?> GetAsync(string providerJobId, CancellationToken cancellationToken)
    {
        var client = await ClientAsync(cancellationToken);
        try
        {
            return ToProviderJob((await client.GetJobAsync(new GetJobRequest { Id = providerJobId }, cancellationToken)).Job);
        }
        catch (NotFoundException)
        {
            return null;
        }
    }

    private static ProviderJob ToProviderJob(Job job)
    {
        Guid? id = job.UserMetadata is not null && job.UserMetadata.TryGetValue(MediaJobEvents.ProcessingJobIdKey, out var s)
                   && Guid.TryParse(s, out var g) ? g : null;
        var duration = job.OutputGroupDetails?.SelectMany(d => d.OutputDetails ?? []).Select(d => (long?)d.DurationInMs).DefaultIfEmpty(null).Min();
        var status = job.Status?.Value ?? ProviderJobStatus.Submitted;
        return new ProviderJob(job.Id, status == "SUBMITTED" ? ProviderJobStatus.Submitted : status, id,
            job.ErrorCode == 0 ? null : job.ErrorCode.ToString(), job.ErrorMessage, duration);
    }
}

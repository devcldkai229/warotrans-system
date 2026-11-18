using Amazon;
using Amazon.S3;
using Amazon.SQS;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence;

/// <summary>
/// Picks the storage and queue providers from configuration: AWS (S3/SQS, default credential chain, never keys in
/// config files) or Local (folder + Postgres table, tests and offline dev).
/// </summary>
public static class EvidenceInfrastructure
{
    public static IServiceCollection AddEvidenceStorage(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<EvidenceStorageOptions>(configuration.GetSection(EvidenceStorageOptions.SectionName));
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<EvidenceStorageOptions>>().Value);
        var options = configuration.GetSection(EvidenceStorageOptions.SectionName).Get<EvidenceStorageOptions>() ?? new EvidenceStorageOptions();
        if (options.IsS3)
        {
            services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(S3Config(options)));
            services.AddSingleton<IObjectStore, S3ObjectStore>();
        }
        else
        {
            services.AddSingleton<LocalObjectStore>();
            services.AddSingleton<IObjectStore>(sp => sp.GetRequiredService<LocalObjectStore>());
        }

        return services;
    }

    public static IServiceCollection AddEvidenceQueues(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<EvidenceQueueOptions>(configuration.GetSection(EvidenceQueueOptions.SectionName));
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<EvidenceQueueOptions>>().Value);
        var options = configuration.GetSection(EvidenceQueueOptions.SectionName).Get<EvidenceQueueOptions>() ?? new EvidenceQueueOptions();
        if (options.IsSqs)
        {
            services.AddSingleton<IAmazonSQS>(_ => new AmazonSQSClient(SqsConfig(options)));
            services.AddSingleton<IWorkQueue, SqsWorkQueue>();
        }
        else
        {
            services.AddSingleton<IWorkQueue, LocalWorkQueue>();
        }

        return services;
    }

    private static AmazonS3Config S3Config(EvidenceStorageOptions o)
    {
        var config = new AmazonS3Config { RegionEndpoint = RegionEndpoint.GetBySystemName(o.Region) };
        if (!string.IsNullOrWhiteSpace(o.ServiceUrl))
        {
            config.ServiceURL = o.ServiceUrl;
            config.ForcePathStyle = true;
        }

        return config;
    }

    private static AmazonSQSConfig SqsConfig(EvidenceQueueOptions o)
    {
        var config = new AmazonSQSConfig { RegionEndpoint = RegionEndpoint.GetBySystemName(o.Region) };
        if (!string.IsNullOrWhiteSpace(o.ServiceUrl))
        {
            config.ServiceURL = o.ServiceUrl;
        }

        return config;
    }
}

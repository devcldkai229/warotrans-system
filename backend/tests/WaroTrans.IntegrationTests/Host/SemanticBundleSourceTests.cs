using WaroTrans.Host.Extensions;

namespace WaroTrans.IntegrationTests.Host;

public class SemanticBundleSourceTests
{
    [Theory]
    [InlineData("s3://warotrans-ob-storage/semantic/map_one_v013/", "warotrans-ob-storage", "semantic/map_one_v013/")]
    [InlineData("s3://warotrans-ob-storage/semantic/map_one_v013", "warotrans-ob-storage", "semantic/map_one_v013/")]
    public void An_s3_uri_names_the_bucket_and_the_bundle_prefix(string uri, string bucket, string prefix)
    {
        Assert.Equal((bucket, prefix), SemanticBundleSource.Parse(uri));
    }

    [Theory]
    [InlineData("warotrans-ob-storage/semantic/map_one_v013/")]
    [InlineData("s3://warotrans-ob-storage")]
    [InlineData("s3://warotrans-ob-storage/")]
    [InlineData("s3:///semantic/")]
    public void Anything_else_stops_the_start(string uri)
    {
        Assert.Throws<InvalidOperationException>(() => SemanticBundleSource.Parse(uri));
    }
}

using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using WaroTrans.Navigation.Services;

namespace WaroTrans.UnitTests.Navigation;

public class LocalMapAssetStoreTests
{
    [Fact]
    public async Task Clone_reads_the_pgm_its_map_uri_points_to()
    {
        var root = Directory.CreateTempSubdirectory("waro-assets-");
        try
        {
            var store = new LocalMapAssetStore(new Env(root.FullName));
            var warehouse = Guid.NewGuid();
            var source = Guid.NewGuid();
            var uris = await store.SaveImportedAsync(warehouse, source, [1, 2, 3], "image: map.pgm", [9]);

            // The clone keeps the source's MapUri but has its own id (no files of its own).
            var bytes = await store.TryReadMapPgmAsync(uris.MapUri, warehouse, Guid.NewGuid());

            Assert.Equal([1, 2, 3], bytes);
        }
        finally
        {
            root.Delete(recursive: true);
        }
    }

    [Fact]
    public async Task Uri_escaping_the_asset_root_is_not_read()
    {
        var root = Directory.CreateTempSubdirectory("waro-assets-");
        try
        {
            var store = new LocalMapAssetStore(new Env(root.FullName));
            Assert.Null(await store.TryReadMapPgmAsync("/map-assets/../../secret.pgm", Guid.NewGuid(), Guid.NewGuid()));
        }
        finally
        {
            root.Delete(recursive: true);
        }
    }

    private sealed class Env(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

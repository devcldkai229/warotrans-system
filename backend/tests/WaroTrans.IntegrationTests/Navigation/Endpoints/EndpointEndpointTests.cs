using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Navigation.Endpoints;

/// <summary>
/// HTTP → EF → PostgreSQL coverage for Endpoint configuration on a MapVersion.
/// Validation edge cases live in UnitTests; this class covers routing, JSON binding,
/// string enum persistence, code generation via IBusinessCodeGenerator and ProblemDetails mapping.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class EndpointEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private sealed record MapDto(Guid Id, string Status);

    private sealed record EndpointDto(
        Guid Id,
        Guid MapVersionId,
        string Code,
        string Name,
        string EndpointType,
        double X,
        double Y,
        double Yaw,
        double PositionTolerance,
        double YawTolerance,
        bool IsEnabled);

    private static object CreateBody(string name = "Receiving dock 1", string type = "INBOUND") => new
    {
        name,
        endpointType = type,
        x = 12.5,
        y = 3.25,
        yaw = 1.57,
        positionTolerance = 0.1,
        yawTolerance = 0.2
    };

    private async Task<Guid> CreateDraftMapAsync()
    {
        var response = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{Guid.NewGuid()}/maps",
            new { name = "Map", mapUri = "http://storage/map.yaml", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MapDto>())!.Id;
    }

    private async Task<EndpointDto> CreateEndpointAsync(Guid mapId, string name, string type = "INBOUND")
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody(name, type));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
    }

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    [Fact]
    public async Task Post_endpoint_persists_row_with_code_generated_from_name()
    {
        var mapId = await CreateDraftMapAsync();

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody("Shelf A", "STORAGE"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
        Assert.Equal($"/api/navigation/endpoints/{created.Id}", response.Headers.Location?.ToString());
        Assert.Equal("EP-SHELF-A", created.Code);
        Assert.Equal("Shelf A", created.Name);
        Assert.Equal("STORAGE", created.EndpointType);
        Assert.True(created.IsEnabled);

        await using var connection = new NpgsqlConnection(PostgreSql.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT map_version_id, code, endpoint_type, x, y, yaw, position_tolerance, yaw_tolerance, is_enabled FROM navigation.endpoints WHERE id = @id",
            connection);
        command.Parameters.AddWithValue("id", created.Id);
        await using var reader = await command.ExecuteReaderAsync();

        Assert.True(await reader.ReadAsync());
        Assert.Equal(mapId, reader.GetGuid(0));
        Assert.Equal("EP-SHELF-A", reader.GetString(1));
        Assert.Equal("STORAGE", reader.GetString(2));
        Assert.Equal(12.5, reader.GetDouble(3));
        Assert.Equal(3.25, reader.GetDouble(4));
        Assert.Equal(1.57, reader.GetDouble(5));
        Assert.Equal(0.1, reader.GetDouble(6));
        Assert.Equal(0.2, reader.GetDouble(7));
        Assert.True(reader.GetBoolean(8));
    }

    [Fact]
    public async Task Post_endpoint_returns_409_when_name_already_used_on_same_map()
    {
        var mapId = await CreateDraftMapAsync();
        await CreateEndpointAsync(mapId, "Charging dock 1", "CHARGING");

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody("charging dock 1", "CHARGING"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("endpoint_code_conflict", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Post_endpoint_allows_same_name_on_different_maps()
    {
        var mapId = await CreateDraftMapAsync();
        var otherMapId = await CreateDraftMapAsync();

        var first = await CreateEndpointAsync(mapId, "Outbound 01", "OUTBOUND");
        var second = await CreateEndpointAsync(otherMapId, "Outbound 01", "OUTBOUND");

        Assert.Equal("EP-OUTBOUND-01", first.Code);
        Assert.Equal("EP-OUTBOUND-01", second.Code);
    }

    [Fact]
    public async Task Post_endpoint_returns_404_when_map_missing()
    {
        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{Guid.NewGuid()}/endpoints", CreateBody());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("map_version_not_found", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Post_endpoint_returns_400_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Post_endpoint_returns_400_when_request_invalid()
    {
        var mapId = await CreateDraftMapAsync();

        var response = await Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody(type: "SHELF"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Concurrent_posts_with_same_name_persist_exactly_one_endpoint()
    {
        var mapId = await CreateDraftMapAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            Client.PostAsJsonAsync($"/api/navigation/maps/{mapId}/endpoints", CreateBody("Parking 1", "PARKING"))));

        // Losers of the race must get 409 (existence check or unique index), never 500.
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(
            responses.Where(r => r.StatusCode != HttpStatusCode.Created),
            r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));

        var list = (await Client.GetFromJsonAsync<List<EndpointDto>>($"/api/navigation/maps/{mapId}/endpoints"))!;
        Assert.Equal("EP-PARKING-1", Assert.Single(list).Code);
    }

    [Fact]
    public async Task Get_endpoints_returns_map_endpoints_ordered_by_code()
    {
        var mapId = await CreateDraftMapAsync();
        var otherMapId = await CreateDraftMapAsync();
        await CreateEndpointAsync(mapId, "Shelf A", "STORAGE");
        await CreateEndpointAsync(mapId, "Charger 1", "CHARGING");
        await CreateEndpointAsync(otherMapId, "Dock 1", "INBOUND");

        var list = (await Client.GetFromJsonAsync<List<EndpointDto>>($"/api/navigation/maps/{mapId}/endpoints"))!;

        Assert.Equal(["EP-CHARGER-1", "EP-SHELF-A"], list.Select(e => e.Code));
    }

    [Fact]
    public async Task Get_endpoints_returns_404_when_map_missing()
    {
        var response = await Client.GetAsync($"/api/navigation/maps/{Guid.NewGuid()}/endpoints");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("map_version_not_found", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task Get_endpoint_by_id_returns_endpoint_or_404()
    {
        var mapId = await CreateDraftMapAsync();
        var created = await CreateEndpointAsync(mapId, "Outbound 01", "OUTBOUND");

        var found = await Client.GetFromJsonAsync<EndpointDto>($"/api/navigation/endpoints/{created.Id}");
        var missing = await Client.GetAsync($"/api/navigation/endpoints/{Guid.NewGuid()}");

        Assert.Equal(created, found);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("endpoint_not_found", await ProblemCodeAsync(missing));
    }

    [Fact]
    public async Task Put_endpoint_updates_fields_and_keeps_code()
    {
        var mapId = await CreateDraftMapAsync();
        var endpoint = await CreateEndpointAsync(mapId, "Dock 1", "INBOUND");

        var response = await Client.PutAsJsonAsync($"/api/navigation/endpoints/{endpoint.Id}", new
        {
            name = "Charger 2",
            endpointType = "CHARGING",
            x = 20.0,
            y = 30.0,
            yaw = -1.0,
            positionTolerance = 0.15,
            yawTolerance = 0.3,
            isEnabled = false
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<EndpointDto>())!;
        Assert.Equal("EP-DOCK-1", updated.Code);
        Assert.Equal("Charger 2", updated.Name);
        Assert.Equal("CHARGING", updated.EndpointType);

        var reloaded = await Client.GetFromJsonAsync<EndpointDto>($"/api/navigation/endpoints/{endpoint.Id}");
        Assert.Equal(updated, reloaded);
        Assert.Equal(20.0, reloaded!.X);
        Assert.False(reloaded.IsEnabled);
    }

    [Fact]
    public async Task Put_endpoint_returns_400_when_map_published()
    {
        var mapId = await CreateDraftMapAsync();
        var endpoint = await CreateEndpointAsync(mapId, "Dock 1", "INBOUND");
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var response = await Client.PutAsJsonAsync($"/api/navigation/endpoints/{endpoint.Id}", new
        {
            name = "Changed",
            endpointType = "INBOUND",
            x = 1.0,
            y = 1.0,
            yaw = 0.0,
            positionTolerance = 0.1,
            yawTolerance = 0.1,
            isEnabled = true
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("map_version_not_draft", await ProblemCodeAsync(response));
    }
}

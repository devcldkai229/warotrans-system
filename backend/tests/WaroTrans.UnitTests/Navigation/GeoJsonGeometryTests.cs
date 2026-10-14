using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Geometry;

namespace WaroTrans.UnitTests.Navigation;

public class GeoJsonGeometryTests
{
    [Fact]
    public void LineString_AcceptsValidCoordinates()
    {
        var geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[0,0],[1,1]]}""").RootElement;
        var points = GeoJsonGeometry.ParseLineStringCoordinates(geometry);
        Assert.Equal(2, points.Count);
        Assert.Equal(1, points[1][0]);
    }

    [Fact]
    public void LineString_RejectsSinglePoint()
    {
        var geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[0,0]]}""").RootElement;
        var ex = Assert.Throws<DomainValidationException>(() => GeoJsonGeometry.ParseLineStringCoordinates(geometry));
        Assert.Equal("geometry_invalid", ex.Code);
    }

    [Fact]
    public void Polygon_AcceptsClosedRing()
    {
        var geometry = JsonDocument.Parse(
            """{"type":"Polygon","coordinates":[[[0,0],[4,0],[4,3],[0,3],[0,0]]]}""").RootElement;
        var ring = GeoJsonGeometry.ParsePolygonRing(geometry);
        Assert.Equal(5, ring.Count);
    }

    [Fact]
    public void Polygon_RejectsUnclosedRing()
    {
        var geometry = JsonDocument.Parse(
            """{"type":"Polygon","coordinates":[[[0,0],[4,0],[4,3],[0,3]]]}""").RootElement;
        Assert.Throws<DomainValidationException>(() => GeoJsonGeometry.ParsePolygonRing(geometry));
    }

    [Fact]
    public void RejectsWrongType()
    {
        var geometry = JsonDocument.Parse("""{"type":"Point","coordinates":[1,2]}""").RootElement;
        Assert.Throws<DomainValidationException>(() => GeoJsonGeometry.ParseLineStringCoordinates(geometry));
    }
}

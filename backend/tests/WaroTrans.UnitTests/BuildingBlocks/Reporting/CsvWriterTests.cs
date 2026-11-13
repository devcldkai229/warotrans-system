using System.Text;
using WaroTrans.BuildingBlocks.Reporting;

namespace WaroTrans.UnitTests.BuildingBlocks.Reporting;

public class CsvWriterTests
{
    [Fact]
    public void Writes_a_header_and_rows_with_crlf_line_ends()
    {
        var csv = CsvWriter.WithHeader("Name", "Count").Row("Pallet", 3).Row("Box", 0);

        Assert.Equal("Name,Count\r\nPallet,3\r\nBox,0\r\n", csv.ToString());
        Assert.Equal(2, csv.DataRows);
    }

    [Fact]
    public void A_file_with_no_rows_is_just_the_header()
    {
        var csv = CsvWriter.WithHeader("JobNo", "Status");

        Assert.Equal("JobNo,Status\r\n", csv.ToString());
        Assert.Equal(0, csv.DataRows);
    }

    [Theory]
    [InlineData("a,b", "\"a,b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("two\nlines", "\"two\nlines\"")]
    [InlineData("plain", "plain")]
    public void Quotes_cells_the_rfc4180_way(string value, string expected)
    {
        Assert.Equal(expected, CsvWriter.Cell(value));
    }

    [Theory]
    [InlineData("=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\"")]
    [InlineData("+1", "'+1")]
    [InlineData("-cmd", "'-cmd")]
    [InlineData("@SUM(A1)", "'@SUM(A1)")]
    public void Text_that_starts_like_a_formula_stays_text(string value, string expected)
    {
        Assert.Equal(expected, CsvWriter.Cell(value));
    }

    [Fact]
    public void Numbers_use_a_dot_and_at_most_two_decimals_and_stay_numbers_when_negative()
    {
        Assert.Equal("1500", CsvWriter.Cell(1500.0));
        Assert.Equal("93.33", CsvWriter.Cell(93.3333));
        Assert.Equal("-2.5", CsvWriter.Cell(-2.5));
        Assert.Equal("47.5", CsvWriter.Cell(47.50m));
        Assert.Equal("", CsvWriter.Cell(null));
        Assert.Equal("", CsvWriter.Cell(double.NaN));
        Assert.Equal("true", CsvWriter.Cell(true));
    }

    [Fact]
    public void The_bytes_start_with_a_utf8_bom_so_excel_reads_vietnamese()
    {
        var bytes = CsvWriter.WithHeader("Nhãn").ToBytes();

        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
        Assert.Equal("Nhãn\r\n", Encoding.UTF8.GetString(bytes[3..]));
    }
}

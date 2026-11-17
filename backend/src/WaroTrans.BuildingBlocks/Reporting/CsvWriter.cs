using System.Globalization;
using System.Text;

namespace WaroTrans.BuildingBlocks.Reporting;

/// <summary>
/// FE-20: writes report files that Excel opens as they are. RFC 4180 quoting, CRLF line ends and a UTF-8 BOM so
/// Vietnamese text is not read as ANSI. A cell that starts like a formula is prefixed with <c>'</c>, so a job note or a
/// failure message such as <c>=HYPERLINK(...)</c> stays text when the file is opened (CSV injection).
/// </summary>
public sealed class CsvWriter
{
    private static readonly char[] NeedsQuotes = [',', '"', '\r', '\n'];
    private static readonly char[] FormulaStarts = ['=', '+', '-', '@', '\t', '\r'];

    private readonly StringBuilder _text = new();

    public int DataRows { get; private set; }

    public static CsvWriter WithHeader(params string[] columns)
    {
        var writer = new CsvWriter();
        writer.WriteLine(columns);
        return writer;
    }

    /// <summary>One data row. The values are written in the order of the header.</summary>
    public CsvWriter Row(params object?[] values)
    {
        WriteLine(values);
        DataRows++;
        return this;
    }

    public override string ToString() => _text.ToString();

    public byte[] ToBytes()
    {
        return [.. Encoding.UTF8.Preamble, .. Encoding.UTF8.GetBytes(_text.ToString())];
    }

    private void WriteLine(IEnumerable<object?> values)
    {
        var first = true;
        foreach (var value in values)
        {
            if (!first) _text.Append(',');
            _text.Append(Cell(value));
            first = false;
        }

        _text.Append("\r\n");
    }

    /// <summary>
    /// The text of one cell. Numbers use the invariant culture (a dot, never a comma) and keep at most two decimals;
    /// null is an empty cell. Only text is guarded against formulas: a negative number stays a number.
    /// </summary>
    public static string Cell(object? value)
    {
        var text = value switch
        {
            null => string.Empty,
            string s => GuardFormula(s),
            bool b => b ? "true" : "false",
            double d => Number(d),
            float f => Number(f),
            decimal m => m.ToString("0.##", CultureInfo.InvariantCulture),
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            _ => GuardFormula(value.ToString() ?? string.Empty)
        };

        return text.IndexOfAny(NeedsQuotes) >= 0 ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }

    private static string Number(double value) =>
        double.IsFinite(value) ? Math.Round(value, 2).ToString("0.##", CultureInfo.InvariantCulture) : string.Empty;

    private static string GuardFormula(string text) =>
        text.Length > 0 && Array.IndexOf(FormulaStarts, text[0]) >= 0 ? "'" + text : text;
}

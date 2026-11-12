namespace TextHash.Tests;

[TestClass]
public sealed class TextHasherTests
{
    // SHA-256("abc"), FIPS 180-2 appendix B.1.
    private const string AbcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    [TestMethod]
    public void Hashes_to_64_lowercase_hex_characters()
    {
        Assert.AreEqual(AbcHash, TextHasher.Hash("abc"));
    }

    [TestMethod]
    [DataRow("ABC", DisplayName = "upper case")]
    [DataRow("  abc\r\n", DisplayName = "outer whitespace")]
    [DataRow("\tAbC\u00A0", DisplayName = "tab and non-breaking space")]
    public void Ignores_case_and_outer_whitespace(string text)
    {
        Assert.AreEqual(AbcHash, TextHasher.Hash(text));
    }

    [TestMethod]
    [DataRow("Annual return\nFY26")]
    [DataRow("Annual return\r\nFY26")]
    [DataRow("Annual return\rFY26")]
    [DataRow("annual  return \r\n\r\n FY26")]
    [DataRow(" ANNUAL\treturn\u00A0fy26 ")]
    [DataRow("Annual\u2003return\u2028FY26", DisplayName = "em space and line separator")]
    public void Spacing_line_endings_and_case_dont_count(string text)
    {
        Assert.AreEqual("annual return fy26", TextHasher.Normalise(text));
        Assert.AreEqual(TextHasher.Hash("annual return fy26"), TextHasher.Hash(text));
    }

    [TestMethod]
    public void Missing_spaces_do_count()
    {
        Assert.AreNotEqual(TextHasher.Hash("annual return"), TextHasher.Hash("annualreturn"));
    }

    [TestMethod]
    public void Other_differences_count()
    {
        Assert.AreNotEqual(TextHasher.Hash("Annual return FY26"), TextHasher.Hash("Annual return FY27"));
        Assert.AreNotEqual(TextHasher.Hash("Annual return."), TextHasher.Hash("Annual return"));
    }

    [TestMethod]
    public void Composed_and_decomposed_accents_hash_the_same()
    {
        Assert.AreEqual(TextHasher.Hash("caf\u00E9"), TextHasher.Hash("cafe\u0301"));
    }

    [TestMethod]
    public void Hashes_UTF8_bytes_of_the_normalised_text()
    {
        // SHA-256 of "café" as UTF-8 (63 61 66 c3 a9).
        Assert.AreEqual("850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e", TextHasher.Hash("CAF\u00C9"));
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("\r\n\t\u00A0")]
    public void Blank_text_has_no_hash(string? text)
    {
        Assert.IsNull(TextHasher.Hash(text!));
        Assert.AreEqual("", TextHasher.Normalise(text!));
    }

    [TestMethod]
    public void Hashes_long_text()
    {
        var tenThousand = new string('x', 10_000);
        var oneMillion = string.Concat(Enumerable.Repeat("word ", 1_048_576 / 5));
        Assert.AreEqual(64, TextHasher.Hash(tenThousand)!.Length);
        Assert.AreEqual(64, TextHasher.Hash(oneMillion)!.Length);
    }

    [TestMethod]
    public void Text_that_cant_be_normalised_is_still_hashed()
    {
        var loneSurrogate = "abc\uD800";
        Assert.IsNotNull(TextHasher.Hash(loneSurrogate));
        Assert.AreEqual(TextHasher.Hash(loneSurrogate), TextHasher.Hash(" ABC\uD800 "));
    }
}

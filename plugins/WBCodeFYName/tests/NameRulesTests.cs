using Microsoft.Xrm.Sdk;

namespace WBCodeFYName.Tests;

[TestClass]
public sealed class NameRulesTests
{
    [TestMethod]
    [DataRow("00224570", "FY26", "00224570-26")]
    [DataRow("00145570", "FY25", "00145570-25")]
    [DataRow("00224570", "fy26", "00224570-26")]
    [DataRow("00224570", "FY30", "00224570-30")]
    [DataRow("00224570", "FY05", "00224570-05")]
    [DataRow("  00224570 ", " FY26\t", "00224570-26")]
    public void Composes_the_name(string wbCode, string fy, string expected)
    {
        Assert.AreEqual(expected, NameRules.Compose(wbCode, fy));
    }

    [TestMethod]
    [DataRow("00224571", DisplayName = "doesn't end in 70")]
    [DataRow("224570", DisplayName = "too short")]
    [DataRow("0022457", DisplayName = "seven digits")]
    [DataRow("000224570", DisplayName = "nine digits")]
    [DataRow("0022A570", DisplayName = "a letter")]
    [DataRow("0022-4570", DisplayName = "punctuation")]
    [DataRow("٠٠٢٢٤٥٧٠", DisplayName = "non-ASCII digits")]
    public void Rejects_an_invalid_WBCode(string wbCode)
    {
        var error = Assert.ThrowsExactly<InvalidPluginExecutionException>(() => NameRules.Compose(wbCode, "FY26"));
        Assert.AreEqual("WBCode \"" + wbCode + "\" must be eight digits ending in 70, for example 00224570.", error.Message);
    }

    [TestMethod]
    [DataRow("2026")]
    [DataRow("FY2026")]
    [DataRow("FY")]
    [DataRow("FY6")]
    [DataRow("FYab")]
    [DataRow("F Y26")]
    public void Rejects_an_invalid_FY(string fy)
    {
        var error = Assert.ThrowsExactly<InvalidPluginExecutionException>(() => NameRules.Compose("00224570", fy));
        Assert.AreEqual("FY \"" + fy + "\" must be FY followed by two digits, for example FY26.", error.Message);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    public void Rejects_an_empty_WBCode_before_the_FY(string? wbCode)
    {
        var error = Assert.ThrowsExactly<InvalidPluginExecutionException>(() => NameRules.Compose(wbCode!, null!));
        Assert.AreEqual("The selected WBCode has no value.", error.Message);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    public void Rejects_an_empty_FY(string? fy)
    {
        var error = Assert.ThrowsExactly<InvalidPluginExecutionException>(() => NameRules.Compose("00224570", fy!));
        Assert.AreEqual("The selected FY has no value.", error.Message);
    }
}

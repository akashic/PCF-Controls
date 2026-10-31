using System.Text.Json;

namespace WBCodeFYName.Tests;

[TestClass]
public sealed class StepConfigTests
{
    internal const string Valid =
        "{\"targetTable\":\"abc_clientyear\",\"nameColumn\":\"abc_wbcodefy\",\"wbCodeLookup\":\"abc_wbcode\"," +
        "\"wbCodeValueColumn\":\"abc_name\",\"fyLookup\":\"abc_fy\",\"fyValueColumn\":\"abc_fyname\"}";

    private static string ConfigDir => Path.Combine(AppContext.BaseDirectory, "config");

    [TestMethod]
    public void Parses_every_property()
    {
        var config = StepConfig.Parse(Valid);
        Assert.AreEqual("abc_clientyear", config.TargetTable);
        Assert.AreEqual("abc_wbcodefy", config.NameColumn);
        Assert.AreEqual("abc_wbcode", config.WBCodeLookup);
        Assert.AreEqual("abc_name", config.WBCodeValueColumn);
        Assert.AreEqual("abc_fy", config.FYLookup);
        Assert.AreEqual("abc_fyname", config.FYValueColumn);
    }

    [TestMethod]
    public void Accepts_whitespace_and_escapes()
    {
        var json = "\r\n {\n\t" + Valid.Trim('{', '}').Replace("\"abc_fy\"", "\"\\u0061bc_\\u0066y\"") + "\n} \n";
        Assert.AreEqual("abc_fy", StepConfig.Parse(json).FYLookup);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("  \n ")]
    public void Rejects_an_empty_configuration(string? json)
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(json!));
        Assert.AreEqual("The step's unsecure configuration is empty.", error.Message);
    }

    [TestMethod]
    public void Rejects_each_missing_property()
    {
        foreach (var name in StepConfig.PropertyNames)
        {
            var json = JsonSerializer.Serialize(ValidValues().Where(kv => kv.Key != name).ToDictionary());
            var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(json));
            Assert.AreEqual("Missing property \"" + name + "\".", error.Message);
        }
    }

    [TestMethod]
    public void Rejects_an_unknown_property()
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("}", ",\"extra\":\"x\"}")));
        Assert.AreEqual("Unknown property \"extra\".", error.Message);
    }

    [TestMethod]
    public void Property_names_are_case_sensitive()
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("\"targetTable\"", "\"TargetTable\"")));
        Assert.AreEqual("Unknown property \"TargetTable\".", error.Message);
    }

    [TestMethod]
    [DataRow("abc-fy")]
    [DataRow("1abc")]
    [DataRow("")]
    [DataRow("abc fy")]
    [DataRow("abc_fy;drop")]
    public void Rejects_a_value_that_isnt_a_logical_name(string value)
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("\"abc_fy\"", "\"" + value + "\"")));
        Assert.AreEqual("\"fyLookup\" must be a logical name, not \"" + value + "\".", error.Message);
    }

    [TestMethod]
    [DataRow("[]", DisplayName = "an array")]
    [DataRow("{}x", DisplayName = "trailing text")]
    [DataRow("{\"targetTable\":\"a\",}", DisplayName = "a trailing comma")]
    [DataRow("{\"targetTable\":1}", DisplayName = "a number")]
    [DataRow("{\"targetTable\":{\"a\":\"b\"}}", DisplayName = "nesting")]
    [DataRow("{\"targetTable\":null}", DisplayName = "null")]
    [DataRow("{targetTable:\"a\"}", DisplayName = "an unquoted key")]
    [DataRow("{\"targetTable\" \"a\"}", DisplayName = "a missing colon")]
    [DataRow("{\"targetTable\":\"a\" \"nameColumn\":\"b\"}", DisplayName = "a missing comma")]
    [DataRow("{\"targetTable\":\"a", DisplayName = "an unclosed string")]
    [DataRow("{\"targetTable\":\"a\\x\"}", DisplayName = "an unknown escape")]
    [DataRow("{\"targetTable\":\"a\\u00\"}", DisplayName = "a short unicode escape")]
    [DataRow("{\"targetTable\":\"a\tb\"}", DisplayName = "a raw control character")]
    [DataRow("{", DisplayName = "an unclosed object")]
    public void Rejects_malformed_JSON(string json)
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(json));
        Assert.StartsWith("The configuration isn't valid JSON", error.Message);
    }

    [TestMethod]
    public void Rejects_a_duplicate_property()
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("}", ",\"fyLookup\":\"abc_x\"}")));
        Assert.AreEqual("Property \"fyLookup\" appears more than once.", error.Message);
    }

    [TestMethod]
    public void Rejects_an_empty_object_as_missing_properties()
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(" { } "));
        Assert.AreEqual("Missing property \"targetTable\".", error.Message);
    }

    // The schema serves editors; StepConfig enforces the rules at runtime. These keep the two in step.

    [TestMethod]
    public void Schema_matches_StepConfig()
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(ConfigDir, "step-config.schema.json")));
        var root = schema.RootElement;

        CollectionAssert.AreEquivalent(StepConfig.PropertyNames.ToArray(), root.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ToArray());
        CollectionAssert.AreEquivalent(StepConfig.PropertyNames.ToArray(), root.GetProperty("properties").EnumerateObject().Select(p => p.Name).ToArray());
        Assert.IsFalse(root.GetProperty("additionalProperties").GetBoolean());
        Assert.AreEqual(StepConfig.LogicalNamePattern, root.GetProperty("$defs").GetProperty("logicalName").GetProperty("pattern").GetString());
        foreach (var property in root.GetProperty("properties").EnumerateObject())
        {
            Assert.AreEqual("#/$defs/logicalName", property.Value.GetProperty("$ref").GetString(), property.Name);
        }
    }

    [TestMethod]
    public void Every_example_parses()
    {
        var examples = Directory.GetFiles(Path.Combine(ConfigDir, "examples"), "*.json");
        Assert.IsNotEmpty(examples);
        foreach (var path in examples)
        {
            StepConfig.Parse(File.ReadAllText(path));
        }
    }

    private static Dictionary<string, string> ValidValues() =>
        JsonSerializer.Deserialize<Dictionary<string, string>>(Valid)!;
}

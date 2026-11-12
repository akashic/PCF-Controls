using System.Text.Json;

namespace TextHash.Tests;

[TestClass]
public sealed class StepConfigTests
{
    internal const string Valid =
        "{\"targetTable\":\"abc_query\",\"textColumn\":\"abc_description\",\"hashColumn\":\"abc_hash\"," +
        "\"scopeLookup\":\"abc_fund\",\"duplicateMessage\":\"This query already exists for this fund.\"}";

    internal const string Unscoped =
        "{\"targetTable\":\"abc_query\",\"textColumn\":\"abc_description\",\"hashColumn\":\"abc_hash\"," +
        "\"duplicateMessage\":\"This query already exists.\"}";

    private static string ConfigDir => Path.Combine(AppContext.BaseDirectory, "config");

    [TestMethod]
    public void Parses_every_property()
    {
        var config = StepConfig.Parse(Valid);
        Assert.AreEqual("abc_query", config.TargetTable);
        Assert.AreEqual("abc_description", config.TextColumn);
        Assert.AreEqual("abc_hash", config.HashColumn);
        Assert.AreEqual("abc_fund", config.ScopeLookup);
        Assert.AreEqual("This query already exists for this fund.", config.DuplicateMessage);
    }

    [TestMethod]
    public void The_scope_is_optional()
    {
        Assert.IsNull(StepConfig.Parse(Unscoped).ScopeLookup);
    }

    [TestMethod]
    public void Accepts_whitespace_and_escapes()
    {
        var json = "\r\n {\n\t" + Valid.Trim('{', '}').Replace("\"abc_fund\"", "\"\\u0061bc_\\u0066und\"") + "\n} \n";
        Assert.AreEqual("abc_fund", StepConfig.Parse(json).ScopeLookup);
    }

    [TestMethod]
    public void The_message_can_hold_any_text()
    {
        var json = Valid.Replace("This query already exists for this fund.", "Already \\\"there\\\": 100% \\u2014 fix it.");
        Assert.AreEqual("Already \"there\": 100% \u2014 fix it.", StepConfig.Parse(json).DuplicateMessage);
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
    public void Rejects_each_missing_required_property()
    {
        foreach (var name in StepConfig.RequiredPropertyNames)
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
    [DataRow("abc-fund")]
    [DataRow("1abc")]
    [DataRow("")]
    [DataRow("abc fund")]
    [DataRow("abc_fund;drop")]
    public void Rejects_a_value_that_isnt_a_logical_name(string value)
    {
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("\"abc_fund\"", "\"" + value + "\"")));
        Assert.AreEqual("\"scopeLookup\" must be a logical name, not \"" + value + "\".", error.Message);
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("\\n\\t")]
    public void Rejects_a_blank_message(string value)
    {
        var error = Assert.ThrowsExactly<FormatException>(() =>
            StepConfig.Parse(Valid.Replace("This query already exists for this fund.", value)));
        Assert.AreEqual("\"duplicateMessage\" must not be blank.", error.Message);
    }

    [TestMethod]
    [DataRow("[]", DisplayName = "an array")]
    [DataRow("{}x", DisplayName = "trailing text")]
    [DataRow("{\"targetTable\":\"a\",}", DisplayName = "a trailing comma")]
    [DataRow("{\"targetTable\":1}", DisplayName = "a number")]
    [DataRow("{\"targetTable\":{\"a\":\"b\"}}", DisplayName = "nesting")]
    [DataRow("{\"targetTable\":null}", DisplayName = "null")]
    [DataRow("{targetTable:\"a\"}", DisplayName = "an unquoted key")]
    [DataRow("{\"targetTable\":\"a", DisplayName = "an unclosed string")]
    [DataRow("{\"targetTable\":\"a\\x\"}", DisplayName = "an unknown escape")]
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
        var error = Assert.ThrowsExactly<FormatException>(() => StepConfig.Parse(Valid.Replace("}", ",\"hashColumn\":\"abc_x\"}")));
        Assert.AreEqual("Property \"hashColumn\" appears more than once.", error.Message);
    }

    // The schema serves editors and register.mjs; StepConfig enforces the rules at runtime. These keep the two in step.

    [TestMethod]
    public void Schema_matches_StepConfig()
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(ConfigDir, "step-config.schema.json")));
        var root = schema.RootElement;
        var properties = root.GetProperty("properties");

        CollectionAssert.AreEquivalent(StepConfig.RequiredPropertyNames.ToArray(),
            root.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ToArray());
        CollectionAssert.AreEquivalent(StepConfig.RequiredPropertyNames.Concat(StepConfig.OptionalPropertyNames).ToArray(),
            properties.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.IsFalse(root.GetProperty("additionalProperties").GetBoolean());

        var defs = root.GetProperty("$defs");
        Assert.AreEqual(StepConfig.LogicalNamePattern, defs.GetProperty("logicalName").GetProperty("pattern").GetString());
        Assert.AreEqual(StepConfig.MessagePattern, defs.GetProperty("message").GetProperty("pattern").GetString());
        foreach (var property in properties.EnumerateObject())
        {
            var expected = StepConfig.LogicalNamePropertyNames.Contains(property.Name) ? "#/$defs/logicalName" : "#/$defs/message";
            Assert.AreEqual(expected, property.Value.GetProperty("$ref").GetString(), property.Name);
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

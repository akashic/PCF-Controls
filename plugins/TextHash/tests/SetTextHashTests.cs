using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace TextHash.Tests;

[TestClass]
public sealed class SetTextHashTests
{
    private const string Table = "abc_query";
    private const string TextColumn = "abc_description";
    private const string HashColumn = "abc_hash";
    private const string ScopeLookup = "abc_fund";
    private const string Message = "This query already exists for this fund.";
    private const string Description = "Please send the\r\nbank statements.";

    private static readonly string DescriptionHash = TextHasher.Hash(Description)!;

    private FakeOrganizationService service = null!;
    private FakeServiceFactory factory = null!;
    private FakeTracing tracing = null!;
    private FakeContext context = null!;
    private EntityReference fund = null!;
    private EntityReference otherFund = null!;

    [TestInitialize]
    public void Setup()
    {
        service = new FakeOrganizationService();
        factory = new FakeServiceFactory(service);
        tracing = new FakeTracing();
        context = new FakeContext { PrimaryEntityName = Table };
        fund = new EntityReference("abc_fund", Guid.NewGuid());
        otherFund = new EntityReference("abc_fund", Guid.NewGuid());
    }

    private Entity Target(params (string Column, object? Value)[] values)
    {
        var target = new Entity(Table, context.PrimaryEntityId == Guid.Empty ? Guid.Empty : context.PrimaryEntityId);
        foreach (var (column, value) in values) target[column] = value;
        context.InputParameters["Target"] = target;
        return target;
    }

    /// <summary>An Update of an existing row, with its current values in the pre-image.</summary>
    private Entity Existing(string? text, EntityReference? scope)
    {
        var row = service.AddRow(Table, (TextColumn, text), (HashColumn, TextHasher.Hash(text!)), (ScopeLookup, scope));
        context.MessageName = "Update";
        context.PrimaryEntityId = row.Id;
        var image = new Entity(Table, row.Id);
        if (text != null) image[TextColumn] = text;
        if (scope != null) image[ScopeLookup] = scope;
        context.PreEntityImages.Add(SetTextHash.PreImageName, image);
        return row;
    }

    private void Run(string? configuration = StepConfigTests.Valid)
    {
        var plugin = new SetTextHash(configuration!, null!);
        plugin.Execute(new FakeServiceProvider().Add<ITracingService>(tracing).Add<IPluginExecutionContext>(context)
            .Add<IOrganizationServiceFactory>(factory));
    }

    private InvalidPluginExecutionException RunExpectingError(string? configuration = StepConfigTests.Valid) =>
        Assert.ThrowsExactly<InvalidPluginExecutionException>(() => Run(configuration));

    [TestMethod]
    public void Create_sets_the_hash()
    {
        var target = Target((TextColumn, Description), (ScopeLookup, fund));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
        Assert.Contains("SetTextHash: setting abc_hash to " + DescriptionHash + ".", tracing.Lines);
    }

    [TestMethod]
    public void Checks_for_a_duplicate_as_SYSTEM_in_the_same_scope()
    {
        Target((TextColumn, Description), (ScopeLookup, fund));
        Run();
        CollectionAssert.AreEqual(new Guid?[] { null }, factory.CreatedFor, "a null user ID is SYSTEM");
        var query = service.Queries.Single();
        Assert.AreEqual(Table, query.EntityName);
        Assert.AreEqual(2, query.TopCount);
        Assert.IsFalse(query.ColumnSet.AllColumns);
        Assert.IsEmpty(query.ColumnSet.Columns);
        var conditions = query.Criteria.Conditions.Select(c => (c.AttributeName, c.Operator, Value: c.Values.SingleOrDefault())).ToArray();
        CollectionAssert.AreEqual(
            new[] { (HashColumn, ConditionOperator.Equal, (object?)DescriptionHash), (ScopeLookup, ConditionOperator.Equal, (object?)fund.Id) },
            conditions);
    }

    [TestMethod]
    public void Create_overwrites_a_supplied_hash()
    {
        var target = Target((TextColumn, Description), (ScopeLookup, fund), (HashColumn, "made up"));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
    }

    [TestMethod]
    public void Create_of_a_duplicate_in_the_same_fund_is_blocked()
    {
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, fund));
        Target((TextColumn, "  please SEND the bank   statements. "), (ScopeLookup, fund));
        var error = RunExpectingError();
        Assert.AreEqual(Message, error.Message);
    }

    [TestMethod]
    public void The_same_text_in_another_fund_is_allowed()
    {
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, otherFund));
        var target = Target((TextColumn, Description), (ScopeLookup, fund));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
    }

    [TestMethod]
    public void A_row_in_another_table_isnt_a_duplicate()
    {
        service.AddRow("abc_other", (HashColumn, DescriptionHash), (ScopeLookup, fund));
        Target((TextColumn, Description), (ScopeLookup, fund));
        Run();
    }

    [TestMethod]
    public void Without_a_scope_the_text_must_be_unique_across_the_table()
    {
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, otherFund));
        Target((TextColumn, Description), (ScopeLookup, fund));
        var error = RunExpectingError(StepConfigTests.Unscoped);
        Assert.AreEqual("This query already exists.", error.Message);
        Assert.HasCount(1, service.Queries.Single().Criteria.Conditions);
    }

    [TestMethod]
    public void A_blank_scope_matches_other_rows_with_a_blank_scope()
    {
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash));
        Target((TextColumn, Description));
        RunExpectingError();
        var scope = service.Queries.Single().Criteria.Conditions[1];
        Assert.AreEqual((ScopeLookup, ConditionOperator.Null), (scope.AttributeName, scope.Operator));
    }

    [TestMethod]
    public void A_blank_scope_doesnt_match_a_row_with_a_scope()
    {
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, fund));
        Target((TextColumn, Description));
        Run();
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow(" \r\n ")]
    public void Blank_text_clears_the_hash_and_isnt_checked(string? text)
    {
        var target = Target((TextColumn, text), (ScopeLookup, fund), (HashColumn, "made up"));
        Run();
        Assert.IsTrue(target.Contains(HashColumn));
        Assert.IsNull(target[HashColumn]);
        Assert.IsEmpty(service.Queries);
    }

    [TestMethod]
    public void Create_without_the_text_column_sets_no_hash()
    {
        var target = Target((ScopeLookup, fund));
        Run();
        Assert.IsNull(target[HashColumn]);
        Assert.IsEmpty(service.Queries);
    }

    [TestMethod]
    public void Update_of_the_text_takes_the_fund_from_the_pre_image()
    {
        Existing("Old text", fund);
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, fund));
        Target((TextColumn, Description));
        var error = RunExpectingError();
        Assert.AreEqual(Message, error.Message);
    }

    [TestMethod]
    public void Update_that_keeps_the_same_text_doesnt_match_its_own_row()
    {
        Existing(Description, fund);
        var target = Target((TextColumn, Description.ToUpperInvariant()));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
    }

    [TestMethod]
    public void Update_moving_to_a_fund_that_has_the_text_is_blocked()
    {
        Existing(Description, fund);
        service.AddRow(Table, (TextColumn, Description), (HashColumn, DescriptionHash), (ScopeLookup, otherFund));
        var target = Target((ScopeLookup, otherFund));
        var error = RunExpectingError();
        Assert.AreEqual(Message, error.Message);
        Assert.AreEqual(DescriptionHash, target[HashColumn], "the hash comes from the pre-image's text");
    }

    [TestMethod]
    public void Update_writing_only_the_hash_recomputes_it()
    {
        Existing(Description, fund);
        var target = Target((HashColumn, "tampered"));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
    }

    [TestMethod]
    public void Update_clearing_the_text_clears_the_hash()
    {
        Existing(Description, fund);
        var target = Target((TextColumn, null));
        Run();
        Assert.IsNull(target[HashColumn]);
    }

    [TestMethod]
    public void Update_without_a_pre_image_uses_only_the_target()
    {
        context.MessageName = "Update";
        context.PrimaryEntityId = Guid.NewGuid();
        var target = Target((TextColumn, Description));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
        var scope = service.Queries.Single().Criteria.Conditions[1];
        Assert.AreEqual(ConditionOperator.Null, scope.Operator);
    }

    [TestMethod]
    public void The_text_is_never_traced()
    {
        Target((TextColumn, Description), (ScopeLookup, fund));
        Run();
        Assert.IsFalse(tracing.Lines.Any(l => l.Contains("bank statements", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    [DataRow("Delete")]
    [DataRow("Retrieve")]
    public void Other_messages_are_ignored(string message)
    {
        context.MessageName = message;
        var target = Target((TextColumn, Description));
        Run();
        Assert.IsFalse(target.Contains(HashColumn));
    }

    [TestMethod]
    public void Other_tables_are_ignored()
    {
        context.PrimaryEntityName = "abc_other";
        var target = Target((TextColumn, Description));
        Run();
        Assert.IsFalse(target.Contains(HashColumn));
    }

    [TestMethod]
    public void Message_and_table_names_ignore_case()
    {
        context.MessageName = "create";
        context.PrimaryEntityName = "ABC_Query";
        var target = Target((TextColumn, Description));
        Run();
        Assert.AreEqual(DescriptionHash, target[HashColumn]);
    }

    [TestMethod]
    public void A_missing_target_is_ignored()
    {
        Run();
        Assert.IsEmpty(service.Queries);
    }

    [TestMethod]
    public void A_target_that_isnt_an_entity_is_ignored()
    {
        context.InputParameters["Target"] = new EntityReference(Table, Guid.NewGuid());
        Run();
        Assert.IsEmpty(service.Queries);
    }

    [TestMethod]
    [DataRow(10)]
    [DataRow(40)]
    public void The_wrong_stage_is_a_configuration_error(int stage)
    {
        context.Stage = stage;
        Target((TextColumn, Description));
        var error = RunExpectingError();
        Assert.AreEqual(SetTextHash.ConfigurationErrorMessage, error.Message);
        Assert.Contains("SetTextHash: registered at stage " + stage + "; it must be PreOperation (20).", tracing.Lines);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("{\"targetTable\":\"abc_query\"}")]
    [DataRow("not json")]
    public void A_bad_configuration_blocks_every_save(string? configuration)
    {
        context.PrimaryEntityName = "abc_anything";
        Target((TextColumn, Description));
        var error = RunExpectingError(configuration);
        Assert.AreEqual(SetTextHash.ConfigurationErrorMessage, error.Message);
        Assert.StartsWith("SetTextHash: the step configuration is invalid: ", tracing.Lines.Single());
    }

    [TestMethod]
    public void A_failing_query_gets_the_generic_message()
    {
        service.QueryFailure = new TimeoutException("SQL timeout");
        Target((TextColumn, Description), (ScopeLookup, fund));
        var error = RunExpectingError();
        Assert.AreEqual(SetTextHash.UnexpectedErrorMessage, error.Message);
        Assert.IsInstanceOfType<TimeoutException>(error.InnerException);
        Assert.IsTrue(tracing.Lines.Any(l => l.StartsWith("SetTextHash failed: System.TimeoutException: SQL timeout")));
    }

    [TestMethod]
    public void A_null_service_provider_throws()
    {
        Assert.ThrowsExactly<ArgumentNullException>(() => new SetTextHash(StepConfigTests.Valid, null!).Execute(null!));
    }
}

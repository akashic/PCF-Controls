using Microsoft.Xrm.Sdk;

namespace WBCodeFYName.Tests;

[TestClass]
public sealed class SetPrimaryNameTests
{
    private const string Table = "abc_clientyear";
    private const string NameColumn = "abc_wbcodefy";
    private const string WBCodeLookup = "abc_wbcode";
    private const string FYLookup = "abc_fy";

    private FakeOrganizationService service = null!;
    private FakeServiceFactory factory = null!;
    private FakeTracing tracing = null!;
    private FakeContext context = null!;
    private EntityReference wbCode = null!;
    private EntityReference otherWBCode = null!;
    private EntityReference fy = null!;
    private EntityReference otherFY = null!;

    [TestInitialize]
    public void Setup()
    {
        service = new FakeOrganizationService();
        factory = new FakeServiceFactory(service);
        tracing = new FakeTracing();
        context = new FakeContext { PrimaryEntityName = Table };
        wbCode = service.AddRow("abc_wbcodes", "abc_name", "00224570");
        otherWBCode = service.AddRow("abc_wbcodes", "abc_name", "00145570");
        fy = service.AddRow("abc_fys", "abc_fyname", "FY26");
        otherFY = service.AddRow("abc_fys", "abc_fyname", "FY25");
    }

    private Entity Target(params (string Column, object? Value)[] values)
    {
        var target = new Entity(Table, Guid.NewGuid());
        foreach (var (column, value) in values) target[column] = value;
        context.InputParameters["Target"] = target;
        return target;
    }

    private void PreImage(EntityReference? wbCodeValue, EntityReference? fyValue)
    {
        var image = new Entity(Table, Guid.NewGuid());
        if (wbCodeValue != null) image[WBCodeLookup] = wbCodeValue;
        if (fyValue != null) image[FYLookup] = fyValue;
        context.PreEntityImages.Add(SetPrimaryName.PreImageName, image);
    }

    private void Run(string? configuration = StepConfigTests.Valid)
    {
        var plugin = new SetPrimaryName(configuration!, null!);
        plugin.Execute(new FakeServiceProvider().Add<ITracingService>(tracing).Add<IPluginExecutionContext>(context)
            .Add<IOrganizationServiceFactory>(factory));
    }

    private InvalidPluginExecutionException RunExpectingError(string? configuration = StepConfigTests.Valid) =>
        Assert.ThrowsExactly<InvalidPluginExecutionException>(() => Run(configuration));

    [TestMethod]
    public void Create_sets_the_name_from_both_lookups()
    {
        var target = Target((WBCodeLookup, wbCode), (FYLookup, fy));
        Run();
        Assert.AreEqual("00224570-26", target[NameColumn]);
        Assert.AreEqual(context.UserId, factory.CreatedFor, "retrieves as the calling user");
        CollectionAssert.AreEqual(new[] { "abc_name" }, service.Retrieves[0].Columns);
        CollectionAssert.AreEqual(new[] { "abc_fyname" }, service.Retrieves[1].Columns);
        Assert.Contains("SetPrimaryName: setting abc_wbcodefy to 00224570-26.", tracing.Lines);
    }

    [TestMethod]
    public void Create_overwrites_a_supplied_name()
    {
        var target = Target((WBCodeLookup, wbCode), (FYLookup, fy), (NameColumn, "typed by hand"));
        Run();
        Assert.AreEqual("00224570-26", target[NameColumn]);
    }

    [TestMethod]
    public void Create_without_WBCode_is_rejected()
    {
        Target((FYLookup, fy));
        Assert.AreEqual(SetPrimaryName.MissingWBCodeMessage, RunExpectingError().Message);
    }

    [TestMethod]
    public void Create_without_FY_is_rejected()
    {
        Target((WBCodeLookup, wbCode));
        Assert.AreEqual(SetPrimaryName.MissingFYMessage, RunExpectingError().Message);
    }

    [TestMethod]
    public void Update_of_FY_only_takes_WBCode_from_the_pre_image()
    {
        context.MessageName = "Update";
        PreImage(wbCode, otherFY);
        var target = Target((FYLookup, fy));
        Run();
        Assert.AreEqual("00224570-26", target[NameColumn]);
    }

    [TestMethod]
    public void Update_of_WBCode_only_takes_FY_from_the_pre_image()
    {
        context.MessageName = "Update";
        PreImage(wbCode, fy);
        var target = Target((WBCodeLookup, otherWBCode));
        Run();
        Assert.AreEqual("00145570-26", target[NameColumn]);
    }

    [TestMethod]
    public void Update_of_both_lookups_uses_the_incoming_values()
    {
        context.MessageName = "Update";
        PreImage(wbCode, fy);
        var target = Target((WBCodeLookup, otherWBCode), (FYLookup, otherFY));
        Run();
        Assert.AreEqual("00145570-25", target[NameColumn]);
    }

    [TestMethod]
    public void Update_clearing_a_lookup_is_rejected_even_with_a_pre_image()
    {
        context.MessageName = "Update";
        PreImage(wbCode, fy);
        Target((FYLookup, null));
        Assert.AreEqual(SetPrimaryName.MissingFYMessage, RunExpectingError().Message);
    }

    [TestMethod]
    public void Update_writing_only_the_name_recomputes_it()
    {
        context.MessageName = "Update";
        PreImage(wbCode, fy);
        var target = Target((NameColumn, "99999999-99"));
        Run();
        Assert.AreEqual("00224570-26", target[NameColumn]);
    }

    [TestMethod]
    public void Update_without_a_pre_image_is_rejected_when_a_lookup_isnt_in_the_save()
    {
        context.MessageName = "Update";
        Target((FYLookup, fy));
        Assert.AreEqual(SetPrimaryName.MissingWBCodeMessage, RunExpectingError().Message);
    }

    [TestMethod]
    [DataRow("Delete", Table)]
    [DataRow("Retrieve", Table)]
    [DataRow("Create", "abc_othertable")]
    public void Other_messages_and_tables_are_ignored(string message, string table)
    {
        context.MessageName = message;
        context.PrimaryEntityName = table;
        var target = Target((WBCodeLookup, wbCode), (FYLookup, fy));
        Run();
        Assert.IsFalse(target.Contains(NameColumn));
        Assert.IsEmpty(service.Retrieves);
    }

    [TestMethod]
    public void Message_and_table_names_are_matched_case_insensitively()
    {
        context.MessageName = "update";
        context.PrimaryEntityName = "ABC_ClientYear";
        var target = Target((WBCodeLookup, wbCode), (FYLookup, fy));
        Run();
        Assert.AreEqual("00224570-26", target[NameColumn]);
    }

    [TestMethod]
    public void A_target_that_isnt_an_entity_is_ignored()
    {
        context.InputParameters["Target"] = new EntityReference(Table, Guid.NewGuid());
        Run();
        Assert.IsEmpty(service.Retrieves);
    }

    [TestMethod]
    public void A_referenced_row_with_no_value_is_rejected()
    {
        var empty = service.AddRow("abc_wbcodes", "abc_name", null);
        Target((WBCodeLookup, empty), (FYLookup, fy));
        Assert.AreEqual("The selected WBCode has no value.", RunExpectingError().Message);
    }

    [TestMethod]
    public void An_invalid_referenced_value_is_rejected_with_the_rule()
    {
        var bad = service.AddRow("abc_fys", "abc_fyname", "2026");
        Target((WBCodeLookup, wbCode), (FYLookup, bad));
        Assert.AreEqual("FY \"2026\" must be FY followed by two digits, for example FY26.", RunExpectingError().Message);
    }

    [TestMethod]
    public void A_failed_retrieve_is_wrapped_in_a_generic_message_and_traced()
    {
        var failure = new InvalidOperationException("Principal user is missing prvReadabc_fy privilege");
        service.RetrieveFailure = failure;
        Target((WBCodeLookup, wbCode), (FYLookup, fy));
        var error = RunExpectingError();
        Assert.AreEqual(SetPrimaryName.UnexpectedErrorMessage, error.Message);
        Assert.AreSame(failure, error.InnerException);
        var trace = tracing.Lines.Single();
        Assert.StartsWith("SetPrimaryName failed: ", trace);
        Assert.Contains("prvReadabc_fy", trace);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("{\"targetTable\":\"abc_clientyear\"}")]
    [DataRow("not json")]
    public void Invalid_configuration_blocks_every_save_and_traces_why(string? configuration)
    {
        Target((WBCodeLookup, wbCode), (FYLookup, fy));
        Assert.AreEqual(SetPrimaryName.ConfigurationErrorMessage, RunExpectingError(configuration).Message);
        Assert.StartsWith("SetPrimaryName: the step configuration is invalid: ", tracing.Lines.Single());
        Assert.IsEmpty(service.Retrieves);
    }

    [TestMethod]
    [DataRow(10)]
    [DataRow(40)]
    public void A_step_registered_outside_PreOperation_blocks_the_save(int stage)
    {
        context.Stage = stage;
        Target((WBCodeLookup, wbCode), (FYLookup, fy));
        Assert.AreEqual(SetPrimaryName.ConfigurationErrorMessage, RunExpectingError().Message);
        Assert.AreEqual("SetPrimaryName: registered at stage " + stage + "; it must be PreOperation (20).", tracing.Lines.Single());
    }

    [TestMethod]
    public void Null_service_provider_throws()
    {
        Assert.ThrowsExactly<ArgumentNullException>(() => new SetPrimaryName(StepConfigTests.Valid, null!).Execute(null!));
    }

    [TestMethod]
    public void The_same_instance_can_run_many_saves()
    {
        // The platform caches plug-in instances, so nothing may leak between executions.
        var plugin = new SetPrimaryName(StepConfigTests.Valid, null!);
        var provider = new FakeServiceProvider().Add<ITracingService>(tracing).Add<IPluginExecutionContext>(context)
            .Add<IOrganizationServiceFactory>(factory);

        var first = Target((WBCodeLookup, wbCode), (FYLookup, fy));
        plugin.Execute(provider);
        var second = Target((WBCodeLookup, otherWBCode), (FYLookup, otherFY));
        plugin.Execute(provider);

        Assert.AreEqual("00224570-26", first[NameColumn]);
        Assert.AreEqual("00145570-25", second[NameColumn]);
    }
}

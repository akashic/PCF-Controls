using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace WBCodeFYName.Tests;

// Hand-written fakes of the Microsoft.Xrm.Sdk interfaces (ADR-0006: no FakeXrmEasy).

internal sealed class FakeServiceProvider : IServiceProvider
{
    private readonly Dictionary<Type, object> services = new();

    public FakeServiceProvider Add<T>(T service) where T : class
    {
        services[typeof(T)] = service;
        return this;
    }

    public object? GetService(Type serviceType) => services.TryGetValue(serviceType, out var service) ? service : null;
}

internal sealed class FakeTracing : ITracingService
{
    public List<string> Lines { get; } = new();

    public void Trace(string format, params object[] args) => Lines.Add(string.Format(format, args));
}

internal sealed class FakeContext : IPluginExecutionContext
{
    public int Stage { get; set; } = 20;
    public IPluginExecutionContext ParentContext { get; set; } = null!;
    public int Mode { get; set; }
    public int IsolationMode { get; set; } = 2;
    public int Depth { get; set; } = 1;
    public string MessageName { get; set; } = "Create";
    public string PrimaryEntityName { get; set; } = "";
    public Guid? RequestId { get; set; }
    public string SecondaryEntityName { get; set; } = "none";
    public ParameterCollection InputParameters { get; } = new();
    public ParameterCollection OutputParameters { get; } = new();
    public ParameterCollection SharedVariables { get; } = new();
    public Guid UserId { get; set; } = Guid.NewGuid();
    public Guid InitiatingUserId { get; set; }
    public Guid BusinessUnitId { get; set; }
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = "test";
    public Guid PrimaryEntityId { get; set; }
    public EntityImageCollection PreEntityImages { get; } = new();
    public EntityImageCollection PostEntityImages { get; } = new();
    public EntityReference OwningExtension { get; set; } = null!;
    public Guid CorrelationId { get; set; }
    public bool IsExecutingOffline { get; set; }
    public bool IsOfflinePlayback { get; set; }
    public bool IsInTransaction { get; set; } = true;
    public Guid OperationId { get; set; }
    public DateTime OperationCreatedOn { get; set; }
}

internal sealed class FakeServiceFactory(FakeOrganizationService service) : IOrganizationServiceFactory
{
    public Guid? CreatedFor { get; private set; }

    public IOrganizationService CreateOrganizationService(Guid? userId)
    {
        CreatedFor = userId;
        return service;
    }
}

/// <summary>Holds rows in memory. Retrieve returns only the requested columns; anything else isn't supported.</summary>
internal sealed class FakeOrganizationService : IOrganizationService
{
    private readonly Dictionary<(string, Guid), Entity> rows = new();

    public List<(string Table, Guid Id, string[] Columns)> Retrieves { get; } = new();

    /// <summary>Thrown by Retrieve instead of returning a row, e.g. to simulate a missing Read privilege.</summary>
    public Exception? RetrieveFailure { get; set; }

    public EntityReference AddRow(string table, string column, string? value)
    {
        var row = new Entity(table, Guid.NewGuid());
        if (value != null) row[column] = value;
        rows[(table, row.Id)] = row;
        return row.ToEntityReference();
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        Retrieves.Add((entityName, id, columnSet.Columns.ToArray()));
        if (RetrieveFailure != null) throw RetrieveFailure;
        var row = rows[(entityName, id)];
        var result = new Entity(entityName, id);
        foreach (var column in columnSet.Columns)
        {
            if (row.Contains(column)) result[column] = row[column];
        }
        return result;
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public void Update(Entity entity) => throw new NotSupportedException("The plug-in must never update its own row.");
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();
    public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
}

using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace TextHash.Tests;

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
    public List<Guid?> CreatedFor { get; } = new();

    public IOrganizationService CreateOrganizationService(Guid? userId)
    {
        CreatedFor.Add(userId);
        return service;
    }
}

/// <summary>
/// Holds rows in memory. RetrieveMultiple supports only what the plug-in sends: a QueryExpression with Equal and Null
/// conditions ANDed together, and TopCount. Anything else isn't supported.
/// </summary>
internal sealed class FakeOrganizationService : IOrganizationService
{
    private readonly List<Entity> rows = new();

    public List<QueryExpression> Queries { get; } = new();

    /// <summary>Thrown by RetrieveMultiple instead of returning rows, e.g. to simulate a timeout.</summary>
    public Exception? QueryFailure { get; set; }

    public Entity AddRow(string table, params (string Column, object? Value)[] values)
    {
        var row = new Entity(table, Guid.NewGuid());
        foreach (var (column, value) in values) row[column] = value;
        rows.Add(row);
        return row;
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expression = (QueryExpression)query;
        Queries.Add(expression);
        if (QueryFailure != null) throw QueryFailure;
        Assert.AreEqual(LogicalOperator.And, expression.Criteria.FilterOperator);
        Assert.IsEmpty(expression.Criteria.Filters);
        var matches = rows.Where(r => r.LogicalName == expression.EntityName && expression.Criteria.Conditions.All(c => Matches(r, c)));
        if (expression.TopCount.HasValue) matches = matches.Take(expression.TopCount.Value);
        return new EntityCollection(matches.Select(r => new Entity(r.LogicalName, r.Id)).ToList());
    }

    private static bool Matches(Entity row, ConditionExpression condition)
    {
        var value = row.Contains(condition.AttributeName) ? row[condition.AttributeName] : null;
        if (value is EntityReference reference) value = reference.Id;
        return condition.Operator switch
        {
            ConditionOperator.Null => value == null,
            ConditionOperator.Equal => value != null && Equals(value, condition.Values.Single()),
            _ => throw new NotSupportedException(condition.Operator.ToString()),
        };
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
    public Guid Create(Entity entity) => throw new NotSupportedException();
    public void Update(Entity entity) => throw new NotSupportedException("The plug-in must never update its own row.");
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();
}

using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace TextHash
{
    /// <summary>
    /// Synchronous PreOperation plug-in on Create and Update: hashes a long text column into a column that's in an
    /// alternate key, and blocks a duplicate with a friendly message before the key would
    /// (brief: docs/briefs/2026-11-13-text-hash-plugin.md).
    /// The table, column and message come from the step's unsecure configuration (<see cref="StepConfig"/>).
    /// </summary>
    /// <remarks>
    /// Register the Update step with filtering attributes for the text, hash and scope columns, and a pre-image named
    /// <see cref="PreImageName"/> containing the text and scope. A direct write to the hash is then recomputed.
    /// The plug-in sets Target directly and never updates its own row, so it needs no depth guard.
    /// The platform caches instances, so the only state is the configuration parsed in the constructor.
    /// </remarks>
    public sealed class SetTextHash : IPlugin
    {
        /// <summary>The pre-image name the Update step must register (case-sensitive).</summary>
        public const string PreImageName = "PreImage";

        /// <summary>Shown when the step's configuration is missing or invalid, or the step is registered at the wrong stage.</summary>
        public const string ConfigurationErrorMessage = "Duplicate checking isn't configured correctly. Contact your administrator.";

        /// <summary>Shown for any failure the rules don't explain.</summary>
        public const string UnexpectedErrorMessage =
            "The record couldn't be checked for duplicates. Try again, or contact your administrator.";

        private const int PreOperationStage = 20;

        private readonly StepConfig config;
        private readonly string configurationError;

        public SetTextHash(string unsecureConfiguration, string secureConfiguration)
        {
            // Validate once, when the step loads. Throwing here would surface as an obscure platform error,
            // so remember the reason and block each save with a clear message instead.
            try
            {
                config = StepConfig.Parse(unsecureConfiguration);
            }
            catch (FormatException ex)
            {
                configurationError = ex.Message;
            }
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new ArgumentNullException(nameof(serviceProvider));

            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));

            if (configurationError != null)
            {
                tracing.Trace("SetTextHash: the step configuration is invalid: {0}", configurationError);
                throw new InvalidPluginExecutionException(ConfigurationErrorMessage);
            }

            if (!IsCreateOrUpdate(context.MessageName) ||
                !string.Equals(context.PrimaryEntityName, config.TargetTable, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            // In any other stage, setting Target would silently do nothing.
            if (context.Stage != PreOperationStage)
            {
                tracing.Trace("SetTextHash: registered at stage {0}; it must be PreOperation ({1}).", context.Stage, PreOperationStage);
                throw new InvalidPluginExecutionException(ConfigurationErrorMessage);
            }

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
            {
                return;
            }

            try
            {
                // A hash supplied by the caller is never trusted: it's always recomputed or cleared.
                var hash = TextHasher.Hash(Resolve<string>(target, context, config.TextColumn));
                target[config.HashColumn] = hash;
                if (hash == null)
                {
                    tracing.Trace("SetTextHash: {0} is blank, so {1} is cleared and not checked.", config.TextColumn, config.HashColumn);
                    return;
                }

                var scope = config.ScopeLookup == null ? null : Resolve<EntityReference>(target, context, config.ScopeLookup);
                tracing.Trace("SetTextHash: setting {0} to {1}.", config.HashColumn, hash);

                // As SYSTEM: the alternate key blocks a duplicate whether or not the user can read it, so a check as the
                // user would miss rows they can't see and leave them with the platform's error. The plug-in only says
                // that a duplicate exists, which the key would say anyway.
                var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
                var service = factory.CreateOrganizationService(null);
                var selfId = target.Id != Guid.Empty ? target.Id : context.PrimaryEntityId;
                foreach (var row in service.RetrieveMultiple(DuplicateQuery(hash, scope)).Entities)
                {
                    if (row.Id != selfId)
                    {
                        tracing.Trace("SetTextHash: {0} {1} already has this text.", config.TargetTable, row.Id);
                        throw new InvalidPluginExecutionException(config.DuplicateMessage);
                    }
                }
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace("SetTextHash failed: {0}", ex);
                throw new InvalidPluginExecutionException(UnexpectedErrorMessage, ex);
            }
        }

        /// <summary>
        /// Rows with the same hash in the same scope. Two are enough: one may be the row being saved.
        /// A blank scope matches other rows with a blank scope.
        /// </summary>
        private QueryExpression DuplicateQuery(string hash, EntityReference scope)
        {
            var query = new QueryExpression(config.TargetTable) { ColumnSet = new ColumnSet(false), TopCount = 2 };
            query.Criteria.AddCondition(config.HashColumn, ConditionOperator.Equal, hash);
            if (config.ScopeLookup != null)
            {
                if (scope == null)
                {
                    query.Criteria.AddCondition(config.ScopeLookup, ConditionOperator.Null);
                }
                else
                {
                    query.Criteria.AddCondition(config.ScopeLookup, ConditionOperator.Equal, scope.Id);
                }
            }
            return query;
        }

        private static bool IsCreateOrUpdate(string message)
        {
            return string.Equals(message, "Create", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(message, "Update", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// The column's incoming value if the save includes it (null when it's being cleared), otherwise its current value
        /// from the pre-image. A Create without the column has neither, so it's null.
        /// </summary>
        private static T Resolve<T>(Entity target, IPluginExecutionContext context, string column)
        {
            if (target.Attributes.Contains(column))
            {
                return target.GetAttributeValue<T>(column);
            }
            if (context.PreEntityImages.Contains(PreImageName))
            {
                return context.PreEntityImages[PreImageName].GetAttributeValue<T>(column);
            }
            return default(T);
        }
    }
}

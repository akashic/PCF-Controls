using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace WBCodeFYName
{
    /// <summary>
    /// Synchronous PreOperation plug-in on Create and Update: sets the WBCodeFY primary name from the WBCode and FY
    /// lookups, whichever channel saves the row (brief: docs/briefs/2026-10-31-wbcodefy-name-plugin.md).
    /// The table and column logical names come from the step's unsecure configuration (<see cref="StepConfig"/>).
    /// </summary>
    /// <remarks>
    /// Register the Update step with filtering attributes for both lookups and the name column, and a pre-image named
    /// <see cref="PreImageName"/> containing both lookups. A direct write to the name is then recomputed and overwritten.
    /// The plug-in sets Target directly and never updates its own row, so it needs no depth guard.
    /// The platform caches instances, so the only state is the configuration parsed in the constructor.
    /// </remarks>
    public sealed class SetPrimaryName : IPlugin
    {
        /// <summary>The pre-image name the Update step must register (case-sensitive).</summary>
        public const string PreImageName = "PreImage";

        /// <summary>Shown when the step's configuration is missing or invalid, or the step is registered at the wrong stage.</summary>
        public const string ConfigurationErrorMessage = "WBCodeFY isn't configured correctly. Contact your administrator.";

        /// <summary>Shown for any failure the rules don't explain, such as a missing Read privilege.</summary>
        public const string UnexpectedErrorMessage =
            "WBCodeFY couldn't be generated. Check the WBCode and FY, and that you can read both, then try again.";

        public const string MissingWBCodeMessage = "WBCode must be set before the record can be saved.";
        public const string MissingFYMessage = "FY must be set before the record can be saved.";

        private const int PreOperationStage = 20;

        private readonly StepConfig config;
        private readonly string configurationError;

        public SetPrimaryName(string unsecureConfiguration, string secureConfiguration)
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
                tracing.Trace("SetPrimaryName: the step configuration is invalid: {0}", configurationError);
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
                tracing.Trace("SetPrimaryName: registered at stage {0}; it must be PreOperation ({1}).", context.Stage, PreOperationStage);
                throw new InvalidPluginExecutionException(ConfigurationErrorMessage);
            }

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
            {
                return;
            }

            try
            {
                var wbCodeReference = ResolveLookup(target, context, config.WBCodeLookup)
                    ?? throw new InvalidPluginExecutionException(MissingWBCodeMessage);
                var fyReference = ResolveLookup(target, context, config.FYLookup)
                    ?? throw new InvalidPluginExecutionException(MissingFYMessage);

                // As the calling user, so Dataverse security applies (brief §2).
                var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
                var service = factory.CreateOrganizationService(context.UserId);

                var name = NameRules.Compose(
                    ReadText(service, wbCodeReference, config.WBCodeValueColumn),
                    ReadText(service, fyReference, config.FYValueColumn));

                tracing.Trace("SetPrimaryName: setting {0} to {1}.", config.NameColumn, name);
                target[config.NameColumn] = name;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace("SetPrimaryName failed: {0}", ex);
                throw new InvalidPluginExecutionException(UnexpectedErrorMessage, ex);
            }
        }

        private static bool IsCreateOrUpdate(string message)
        {
            return string.Equals(message, "Create", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(message, "Update", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// The lookup's incoming value if the save includes it (null when it's being cleared), otherwise its current value
        /// from the pre-image. A Create without the lookup has neither, so it's null.
        /// </summary>
        private static EntityReference ResolveLookup(Entity target, IPluginExecutionContext context, string column)
        {
            if (target.Attributes.Contains(column))
            {
                return target.GetAttributeValue<EntityReference>(column);
            }
            if (context.PreEntityImages.Contains(PreImageName))
            {
                return context.PreEntityImages[PreImageName].GetAttributeValue<EntityReference>(column);
            }
            return null;
        }

        private static string ReadText(IOrganizationService service, EntityReference reference, string column)
        {
            return service.Retrieve(reference.LogicalName, reference.Id, new ColumnSet(column)).GetAttributeValue<string>(column);
        }
    }
}

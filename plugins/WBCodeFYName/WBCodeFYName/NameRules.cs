using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace WBCodeFYName
{
    /// <summary>
    /// The WBCodeFY naming rules: <c>&lt;WBCode&gt;-&lt;last two digits of the FY&gt;</c>, e.g. 00224570 + FY26 = 00224570-26.
    /// Pure: no Dataverse calls, so every rule is unit-tested directly.
    /// </summary>
    public static class NameRules
    {
        // A WBCode is the six-digit Client ID followed by 70, the super fund suffix (GLOSSARY.md).
        // [0-9] rather than \d: in .NET, \d also matches non-ASCII digits.
        private static readonly Regex WBCodePattern = new Regex("^[0-9]{6}70$", RegexOptions.CultureInvariant);

        // FY followed by two digits. FY2n would stop working at FY30, so any two digits are accepted.
        private static readonly Regex FYPattern = new Regex("^FY([0-9]{2})$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

        /// <summary>Validates both values and returns the WBCodeFY name.</summary>
        /// <exception cref="InvalidPluginExecutionException">A value is empty or doesn't match its rule. The message is for the user.</exception>
        public static string Compose(string wbCode, string fy)
        {
            var code = (wbCode ?? string.Empty).Trim();
            var year = (fy ?? string.Empty).Trim();

            if (code.Length == 0)
            {
                throw new InvalidPluginExecutionException("The selected WBCode has no value.");
            }
            if (!WBCodePattern.IsMatch(code))
            {
                throw new InvalidPluginExecutionException(
                    "WBCode \"" + code + "\" must be eight digits ending in 70, for example 00224570.");
            }
            if (year.Length == 0)
            {
                throw new InvalidPluginExecutionException("The selected FY has no value.");
            }

            var match = FYPattern.Match(year);
            if (!match.Success)
            {
                throw new InvalidPluginExecutionException(
                    "FY \"" + year + "\" must be FY followed by two digits, for example FY26.");
            }

            return code + "-" + match.Groups[1].Value;
        }
    }
}

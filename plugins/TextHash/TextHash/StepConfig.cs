using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace TextHash
{
    /// <summary>
    /// The step's unsecure configuration: the logical names of the project's table and columns, and the message shown
    /// for a duplicate (ADR-0006). The JSON Schema in config/step-config.schema.json describes the same rules for
    /// editors; the tests keep them in step.
    /// </summary>
    public sealed class StepConfig
    {
        /// <summary>The properties that must be present.</summary>
        public static readonly IReadOnlyList<string> RequiredPropertyNames = new[]
        {
            "targetTable", "textColumn", "hashColumn", "duplicateMessage",
        };

        /// <summary>The properties that may be left out.</summary>
        public static readonly IReadOnlyList<string> OptionalPropertyNames = new[] { "scopeLookup" };

        /// <summary>The properties whose values are logical names. The rest is <c>duplicateMessage</c>.</summary>
        public static readonly IReadOnlyList<string> LogicalNamePropertyNames = new[]
        {
            "targetTable", "textColumn", "hashColumn", "scopeLookup",
        };

        /// <summary>The pattern every logical name must match.</summary>
        public const string LogicalNamePattern = "^[A-Za-z_][A-Za-z0-9_]*$";

        /// <summary>The pattern the message must match: anything with at least one character that isn't whitespace.</summary>
        public const string MessagePattern = "\\S";

        private static readonly Regex LogicalName = new Regex(LogicalNamePattern, RegexOptions.CultureInvariant);
        private static readonly Regex Message = new Regex(MessagePattern, RegexOptions.CultureInvariant);

        private StepConfig(IDictionary<string, string> values)
        {
            TargetTable = values["targetTable"];
            TextColumn = values["textColumn"];
            HashColumn = values["hashColumn"];
            string scope;
            ScopeLookup = values.TryGetValue("scopeLookup", out scope) ? scope : null;
            DuplicateMessage = values["duplicateMessage"];
        }

        /// <summary>The table the steps are registered on.</summary>
        public string TargetTable { get; }

        /// <summary>The text column whose content must be unique, e.g. a multiple lines of text column.</summary>
        public string TextColumn { get; }

        /// <summary>The single line of text column (64 characters) that receives the hash and is in the alternate key.</summary>
        public string HashColumn { get; }

        /// <summary>
        /// The lookup the text must be unique within, e.g. the fund, or null when the text must be unique across the table.
        /// It's in the alternate key with the hash.
        /// </summary>
        public string ScopeLookup { get; }

        /// <summary>The message a user sees when the text is a duplicate.</summary>
        public string DuplicateMessage { get; }

        /// <summary>Parses and validates the configuration.</summary>
        /// <exception cref="FormatException">The configuration is missing, malformed or incomplete. The message says why.</exception>
        public static StepConfig Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new FormatException("The step's unsecure configuration is empty.");
            }

            var values = FlatJson.ParseObject(json);
            foreach (var key in values.Keys)
            {
                if (!Contains(RequiredPropertyNames, key) && !Contains(OptionalPropertyNames, key))
                {
                    throw new FormatException("Unknown property \"" + key + "\".");
                }
            }
            foreach (var name in RequiredPropertyNames)
            {
                if (!values.ContainsKey(name))
                {
                    throw new FormatException("Missing property \"" + name + "\".");
                }
            }
            foreach (var name in LogicalNamePropertyNames)
            {
                string value;
                if (values.TryGetValue(name, out value) && !LogicalName.IsMatch(value))
                {
                    throw new FormatException("\"" + name + "\" must be a logical name, not \"" + value + "\".");
                }
            }
            if (!Message.IsMatch(values["duplicateMessage"]))
            {
                throw new FormatException("\"duplicateMessage\" must not be blank.");
            }
            return new StepConfig(values);
        }

        private static bool Contains(IReadOnlyList<string> list, string item)
        {
            foreach (var entry in list)
            {
                if (string.Equals(entry, item, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        /// <summary>
        /// A strict reader for a flat JSON object whose values are all strings, so the plug-in needs no extra assembly.
        /// Anything else (numbers, nesting, duplicate keys, trailing commas) is a <see cref="FormatException"/>.
        /// </summary>
        private sealed class FlatJson
        {
            private readonly string text;
            private int pos;

            private FlatJson(string text)
            {
                this.text = text;
            }

            public static Dictionary<string, string> ParseObject(string text)
            {
                var reader = new FlatJson(text);
                var result = new Dictionary<string, string>(StringComparer.Ordinal);
                reader.SkipWhitespace();
                reader.Expect('{');
                reader.SkipWhitespace();
                if (reader.Peek() == '}')
                {
                    reader.pos++;
                }
                else
                {
                    while (true)
                    {
                        reader.SkipWhitespace();
                        var key = reader.ReadString("a property name");
                        reader.SkipWhitespace();
                        reader.Expect(':');
                        reader.SkipWhitespace();
                        var value = reader.ReadString("a string value for \"" + key + "\"");
                        if (result.ContainsKey(key))
                        {
                            throw new FormatException("Property \"" + key + "\" appears more than once.");
                        }
                        result.Add(key, value);
                        reader.SkipWhitespace();
                        if (reader.Peek() == ',')
                        {
                            reader.pos++;
                            continue;
                        }
                        reader.Expect('}');
                        break;
                    }
                }
                reader.SkipWhitespace();
                if (reader.pos != text.Length)
                {
                    throw reader.Error("the end of the configuration");
                }
                return result;
            }

            private char Peek()
            {
                return pos < text.Length ? text[pos] : '\0';
            }

            private void SkipWhitespace()
            {
                while (pos < text.Length && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r'))
                {
                    pos++;
                }
            }

            private void Expect(char c)
            {
                if (Peek() != c)
                {
                    throw Error("'" + c + "'");
                }
                pos++;
            }

            private string ReadString(string what)
            {
                if (Peek() != '"')
                {
                    throw Error(what);
                }
                pos++;
                var sb = new StringBuilder();
                while (true)
                {
                    if (pos >= text.Length)
                    {
                        throw new FormatException("The configuration isn't valid JSON: a string isn't closed.");
                    }
                    var c = text[pos++];
                    if (c == '"')
                    {
                        return sb.ToString();
                    }
                    if (c < ' ')
                    {
                        throw new FormatException("The configuration isn't valid JSON: a string contains a control character.");
                    }
                    if (c != '\\')
                    {
                        sb.Append(c);
                        continue;
                    }
                    var escape = pos < text.Length ? text[pos++] : '\0';
                    switch (escape)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            int code;
                            if (pos + 4 > text.Length ||
                                !int.TryParse(text.Substring(pos, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out code))
                            {
                                throw new FormatException("The configuration isn't valid JSON: a \\u escape needs four hex digits.");
                            }
                            sb.Append((char)code);
                            pos += 4;
                            break;
                        default:
                            throw new FormatException("The configuration isn't valid JSON: unknown escape in a string.");
                    }
                }
            }

            private FormatException Error(string expected)
            {
                var found = pos < text.Length ? "'" + text[pos] + "'" : "the end";
                return new FormatException(
                    "The configuration isn't valid JSON: expected " + expected + " at position " + pos + ", found " + found + ".");
            }
        }
    }
}

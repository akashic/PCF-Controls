using System;
using System.Security.Cryptography;
using System.Text;

namespace TextHash
{
    /// <summary>
    /// Decides what counts as the same text, and hashes it (brief: docs/briefs/2026-11-13-text-hash-plugin.md §4.2).
    /// Changing these rules makes every stored hash stale, so treat any change as breaking.
    /// </summary>
    public static class TextHasher
    {
        /// <summary>
        /// Composes the text (Unicode form C), turns every run of whitespace into one space, drops leading and
        /// trailing whitespace, and lowercases it. Differences of spacing, line endings or case don't count.
        /// </summary>
        public static string Normalise(string text)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;

            string composed;
            try
            {
                composed = text.Normalize(NormalizationForm.FormC);
            }
            catch (ArgumentException)
            {
                // Invalid UTF-16, such as a lone surrogate, can't be normalised. Hash it as it is rather than block the save.
                composed = text;
            }

            var result = new StringBuilder(composed.Length);
            var pendingSpace = false;
            foreach (var c in composed)
            {
                if (char.IsWhiteSpace(c))
                {
                    // Only between words: leading whitespace is dropped, and trailing whitespace is never written.
                    pendingSpace = result.Length > 0;
                    continue;
                }
                if (pendingSpace)
                {
                    result.Append(' ');
                    pendingSpace = false;
                }
                result.Append(c);
            }
            return result.ToString().ToLowerInvariant();
        }

        /// <summary>
        /// The SHA-256 of the normalised text's UTF-8 bytes, as 64 lowercase hex characters,
        /// or null when the text is blank, so blank rows never collide.
        /// </summary>
        public static string Hash(string text)
        {
            var normalised = Normalise(text);
            if (normalised.Length == 0) return null;

            byte[] digest;
            using (var sha = SHA256.Create())
            {
                digest = sha.ComputeHash(Encoding.UTF8.GetBytes(normalised));
            }
            var hex = new StringBuilder(digest.Length * 2);
            foreach (var b in digest)
            {
                hex.Append(b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
            }
            return hex.ToString();
        }
    }
}

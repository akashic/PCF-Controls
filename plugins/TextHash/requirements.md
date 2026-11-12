Yes. Hashing the text into a single line column and putting an alternate key on that column is the standard approach, and it’s the only one that’s actually enforced. Dataverse won’t let you put a multiline text column in an alternate key, and duplicate detection rules only warn users in the UI. They don’t stop API calls, flows, or imports.

The pattern

Add a single line text column, e.g. wb_contenthash, with max length 64. A SHA-256 hex string is exactly 64 characters, well under the 900-byte key size limit. Make it read-only or leave it off the form.
Register a C# plugin on Create and Update, synchronous, PreOperation stage. On Update, set the filtering attribute to the multiline column. The plugin normalises the text, hashes it, and writes the result into the Target. Because it runs inside the same transaction, the key check happens on the save itself.
Create an alternate key on wb_contenthash. Dataverse builds a unique index on it, so any second record with the same hash fails with a DuplicateRecordEntityKey error. This holds whatever the source: UI, Power Automate, Web API, or data import.

Don’t compute the hash any other way

Calculated and formula columns can’t be used in alternate keys, and Power Fx has no hash function anyway.
Power Automate also has no built-in SHA-256. A flow that runs after the save leaves a window where duplicates get in, so it isn’t enforcement.
Form JavaScript only covers the UI.

Normalisation decides what “duplicate” means

This is the part people get wrong. Decide up front what should count as the same text, then apply it before hashing:

Convert \r\n to \n. Forms and APIs don’t always agree on line endings.
Trim leading and trailing whitespace, and optionally collapse internal runs of spaces.
Lowercase the text if case shouldn’t matter.
Apply Unicode normalisation (NFC) and encode as UTF-8 before hashing.

Minimal plugin core

csharp
var target = (Entity)context.InputParameters["Target"];
if (!target.Contains("wb_bodytext")) return;

var text = target.GetAttributeValue<string>("wb_bodytext") ?? string.Empty;
var normalised = text.Replace("\r\n", "\n").Trim().Normalize(NormalizationForm.FormC).ToLowerInvariant();

using (var sha = SHA256.Create())
{
    var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(normalised));
    target["wb_contenthash"] = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
}

Gotchas

Existing data: backfill the hash on existing rows before creating the key. Key activation runs as an async index job and fails if duplicates already exist, so group by the hash first and clean those up.
Blank values: decide how empty text should behave. If every blank row hashes the empty string, only one blank record will ever be allowed. You may want to skip hashing when the text is empty, but test how your key handles nulls before relying on it.
Friendly errors: catch the duplicate key error in flows or apps and show a clear message, since the raw platform error is fairly cryptic.
Integrations: the key also lets you upsert by wb_contenthash, which is useful for integration loads.
Collisions: with SHA-256 the risk is negligible. If you’re paranoid, the plugin can do a retrieve-and-compare of the full text on a key match, but in practice nobody needs to.
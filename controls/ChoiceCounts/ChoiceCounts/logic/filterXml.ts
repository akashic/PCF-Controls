/**
 * Parses the maker's FetchXML filter fragment and accepts only the elements and
 * attributes in the allow-list (brief §2, §5.1). The parsed tree is re-serialised
 * by `serializeXml`, so the raw string never reaches the query.
 *
 * This is a small strict parser rather than `DOMParser`: it rejects anything outside
 * the allow-list as it reads, and it runs in Jest's node environment without jsdom.
 */

export interface XmlElement {
  readonly name: string;
  /** In document order. */
  readonly attributes: readonly (readonly [string, string])[];
  readonly children: readonly XmlElement[];
  /** The text of a `<value>`; `null` for every other element. */
  readonly text: string | null;
}

export type FilterParse = { readonly ok: true; readonly nodes: readonly XmlElement[] } | { readonly ok: false; readonly reason: string };

interface ElementRule {
  readonly attributes: readonly string[];
  readonly children: readonly string[];
  readonly required: readonly string[];
  /** Allowed values for enumerated attributes. */
  readonly values?: Readonly<Record<string, readonly string[]>>;
  readonly text?: true;
}

// From the FetchXML reference. `uiname`, `uitype` and `uihidden` are display hints that
// Advanced Find and the view designer write into exported conditions.
const RULES: Readonly<Record<string, ElementRule>> = {
  filter: {
    attributes: ["type"],
    children: ["condition", "filter", "link-entity"],
    required: [],
    values: { type: ["and", "or"] },
  },
  condition: {
    attributes: ["attribute", "operator", "value", "entityname", "valueof", "uiname", "uitype", "uihidden"],
    children: ["value"],
    required: ["attribute", "operator"],
  },
  value: { attributes: ["uiname", "uitype"], children: [], required: [], text: true },
  "link-entity": {
    attributes: ["name", "from", "to", "alias", "link-type", "visible", "intersect"],
    children: ["filter", "link-entity"],
    required: ["name"],
    values: {
      "link-type": ["inner", "outer", "any", "not any", "all", "not all", "exists", "in", "matchfirstrowusingcrossapply"],
    },
  },
};

const TOP_LEVEL = ["condition", "filter", "link-entity"];
const MAX_DEPTH = 20;
const NAME = /^[A-Za-z][A-Za-z0-9_.-]*/;
const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Own keys only: `in` would also match inherited names such as "constructor" and "__proto__". */
const has = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** A logical name, as the brief requires of every configured name (§4). */
const LOGICAL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** `valueof` can name a column of a link-entity as `alias.column`. */
const COLUMN_REFERENCE = /^[A-Za-z_][A-Za-z0-9_]*(.[A-Za-z_][A-Za-z0-9_]*)?$/;
/** Attributes whose values are names; anything else there only fails in Dataverse, as a generic "—". */
const NAME_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, RegExp>>>> = {
  condition: { attribute: LOGICAL_NAME, entityname: LOGICAL_NAME, valueof: COLUMN_REFERENCE },
  "link-entity": { name: LOGICAL_NAME, from: LOGICAL_NAME, to: LOGICAL_NAME, alias: LOGICAL_NAME },
};
/** A <link-entity> inside a <filter> can only use these link types (FetchXML reference). */
const FILTER_LINK_TYPES = ["any", "not any", "all", "not all"];

/** Code points XML 1.0 allows (its Char production). */
const isXmlChar = (code: number): boolean =>
  code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

class FilterXmlError extends Error {}

class Reader {
  private pos = 0;

  constructor(private readonly text: string) {}

  parse(): XmlElement[] {
    return this.content(null, 0);
  }

  /** Reads children until `parent`'s closing tag, or the end of the text at the top level. */
  private content(parent: string | null, depth: number): XmlElement[] {
    const children: XmlElement[] = [];
    const allowed = parent === null ? TOP_LEVEL : RULES[parent].children;
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) {
        if (parent !== null) throw new FilterXmlError(`<${parent}> isn't closed`);
        return children;
      }
      if (this.text.startsWith("<!--", this.pos)) {
        const end = this.text.indexOf("-->", this.pos + 4);
        if (end === -1) throw new FilterXmlError("a comment isn't closed");
        this.pos = end + 3;
        continue;
      }
      if (this.text.startsWith("</", this.pos)) {
        this.pos += 2;
        const name = this.readName();
        this.skipWhitespace();
        this.expect(">");
        if (name !== parent) throw new FilterXmlError(`</${name}> doesn't close ${parent === null ? "anything" : `<${parent}>`}`);
        return children;
      }
      if (this.text.startsWith("<?", this.pos) || this.text.startsWith("<!", this.pos)) {
        throw new FilterXmlError("XML declarations, DOCTYPE and CDATA aren't allowed");
      }
      if (this.text[this.pos] !== "<") {
        const end = this.text.indexOf("<", this.pos);
        const raw = this.text.slice(this.pos, end === -1 ? undefined : end);
        throw new FilterXmlError(`text ("${raw.trim()}") isn't allowed ${parent === null ? "outside an element" : `in <${parent}>`}`);
      }
      this.pos++;
      const name = this.readName();
      if (!has(RULES, name) || !allowed.includes(name)) {
        throw new FilterXmlError(`<${name}> isn't allowed ${parent === null ? "here" : `in <${parent}>`}; use ${allowed.map((a) => `<${a}>`).join(", ") || "no elements"}`);
      }
      if (depth >= MAX_DEPTH) throw new FilterXmlError(`elements are nested more than ${MAX_DEPTH} deep`);
      children.push(this.element(name, depth + 1, parent));
    }
  }

  private element(name: string, depth: number, parent: string | null): XmlElement {
    const rule = RULES[name];
    const attributes: [string, string][] = [];
    for (;;) {
      this.skipWhitespace();
      if (this.text.startsWith("/>", this.pos)) {
        this.pos += 2;
        return this.finish(name, rule, attributes, [], null, parent);
      }
      if (this.text[this.pos] === ">") {
        this.pos++;
        break;
      }
      const attribute = this.readName();
      if (!rule.attributes.includes(attribute)) throw new FilterXmlError(`<${name}> can't have a "${attribute}" attribute`);
      if (attributes.some(([existing]) => existing === attribute)) throw new FilterXmlError(`<${name}> has "${attribute}" twice`);
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();
      attributes.push([attribute, this.readQuoted()]);
    }
    if (rule.text) {
      const end = this.text.indexOf("<", this.pos);
      const text = decode(this.text.slice(this.pos, end === -1 ? this.text.length : end)).trim();
      this.pos = end === -1 ? this.text.length : end;
      this.content(name, depth);
      return this.finish(name, rule, attributes, [], text, parent);
    }
    return this.finish(name, rule, attributes, this.content(name, depth), null, parent);
  }

  private finish(
    name: string,
    rule: ElementRule,
    attributes: [string, string][],
    children: XmlElement[],
    text: string | null,
    parent: string | null,
  ): XmlElement {
    for (const required of rule.required) {
      if (!attributes.some(([attribute]) => attribute === required)) throw new FilterXmlError(`<${name}> needs a "${required}" attribute`);
    }
    for (const [attribute, value] of attributes) {
      const allowed = rule.values?.[attribute];
      if (allowed && !allowed.includes(value)) throw new FilterXmlError(`<${name} ${attribute}="${value}"> isn't allowed; use ${allowed.join(", ")}`);
      const pattern = NAME_ATTRIBUTES[name]?.[attribute];
      if (pattern && !pattern.test(value)) throw new FilterXmlError(`<${name} ${attribute}="${value}"> isn't a logical name`);
    }
    if (name === "link-entity" && parent === "filter") {
      const linkType = attributes.find(([attribute]) => attribute === "link-type")?.[1];
      if (linkType === undefined || !FILTER_LINK_TYPES.includes(linkType)) {
        throw new FilterXmlError(`a <link-entity> inside a <filter> needs link-type ${FILTER_LINK_TYPES.map((t) => `"${t}"`).join(", ")}`);
      }
    }
    if (name === "condition" && children.length > 0 && attributes.some(([attribute]) => attribute === "value")) {
      throw new FilterXmlError(`a <condition> can't have both a "value" attribute and <value> elements`);
    }
    return { name, attributes, children, text: rule.text ? (text ?? "") : null };
  }

  private readName(): string {
    const match = NAME.exec(this.text.slice(this.pos));
    if (!match) throw new FilterXmlError(`expected a name at position ${this.pos}`);
    this.pos += match[0].length;
    return match[0];
  }

  private readQuoted(): string {
    const quote = this.text[this.pos];
    if (quote !== '"' && quote !== "'") throw new FilterXmlError(`expected a quoted value at position ${this.pos}`);
    const end = this.text.indexOf(quote, this.pos + 1);
    if (end === -1) throw new FilterXmlError("an attribute value isn't closed");
    const raw = this.text.slice(this.pos + 1, end);
    if (raw.includes("<")) throw new FilterXmlError("an attribute value contains <");
    this.pos = end + 1;
    return decode(raw);
  }

  private expect(char: string): void {
    if (this.text[this.pos] !== char) throw new FilterXmlError(`expected "${char}" at position ${this.pos}`);
    this.pos++;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }
}

/** Decodes the five XML entities and numeric character references. */
function decode(raw: string): string {
  return raw.replace(/&([^;\s&]*);?/g, (match, body: string) => {
    if (!match.endsWith(";")) throw new FilterXmlError(`"&" must be written as &amp;`);
    if (has(ENTITIES, body)) return ENTITIES[body];
    const numeric = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(body);
    const code = numeric ? parseInt(numeric[1] ?? numeric[2], numeric[1] ? 16 : 10) : NaN;
    if (!Number.isInteger(code) || code > 0x10ffff) throw new FilterXmlError(`unknown entity "&${body};"`);
    if (!isXmlChar(code)) throw new FilterXmlError(`"&${body};" isn't a character XML allows`);
    return String.fromCodePoint(code);
  });
}

/** Parses `fragment`; on failure, `reason` says what to fix. */
export function parseFilterXml(fragment: string): FilterParse {
  try {
    return { ok: true, nodes: new Reader(fragment).parse() };
  } catch (error) {
    if (error instanceof FilterXmlError) return { ok: false, reason: error.message };
    throw error;
  }
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const escapeText = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Writes elements as XML, escaping every attribute value and text. */
export function serializeXml(nodes: readonly XmlElement[]): string {
  return nodes
    .map((node) => {
      const attributes = node.attributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
      if (node.text !== null) return `<${node.name}${attributes}>${escapeText(node.text)}</${node.name}>`;
      if (node.children.length === 0) return `<${node.name}${attributes} />`;
      return `<${node.name}${attributes}>${serializeXml(node.children)}</${node.name}>`;
    })
    .join("");
}

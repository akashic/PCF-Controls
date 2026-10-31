import { parseFilterXml, serializeXml } from "../ChoiceCounts/logic/filterXml";

/** Parses and re-serialises, so each test states the exact XML the query will contain. */
const roundTrip = (fragment: string): string => {
  const parsed = parseFilterXml(fragment);
  if (!parsed.ok) throw new Error(`expected ${fragment} to parse: ${parsed.reason}`);
  return serializeXml(parsed.nodes);
};

const reason = (fragment: string): string => {
  const parsed = parseFilterXml(fragment);
  if (parsed.ok) throw new Error(`expected ${fragment} to be rejected`);
  return parsed.reason;
};

describe("parseFilterXml accepts", () => {
  test("a single condition, as in the brief's example", () => {
    expect(roundTrip('<condition attribute="statecode" operator="eq" value="0" />')).toBe(
      '<condition attribute="statecode" operator="eq" value="0" />',
    );
  });

  test("several top-level conditions, filters and nesting", () => {
    const fragment = `
      <condition attribute="statecode" operator="eq" value="0"/>
      <filter type="or">
        <condition attribute="abc_due" operator="olderthan-x-days" value="7" />
        <filter><condition attribute="abc_flag" operator="eq" value="1"></condition></filter>
      </filter>`;
    expect(roundTrip(fragment)).toBe(
      '<condition attribute="statecode" operator="eq" value="0" />' +
        '<filter type="or"><condition attribute="abc_due" operator="olderthan-x-days" value="7" />' +
        '<filter><condition attribute="abc_flag" operator="eq" value="1" /></filter></filter>',
    );
  });

  test("<value> lists, trimmed, and Advanced Find's ui* hints", () => {
    const fragment = `<condition attribute="ownerid" operator="in">
        <value uiname="Giles" uitype="systemuser"> {00000000-0000-0000-0000-000000000001} </value>
        <value>{00000000-0000-0000-0000-000000000002}</value>
      </condition>`;
    expect(roundTrip(fragment)).toBe(
      '<condition attribute="ownerid" operator="in"><value uiname="Giles" uitype="systemuser">{00000000-0000-0000-0000-000000000001}</value>' +
        "<value>{00000000-0000-0000-0000-000000000002}</value></condition>",
    );
  });

  test("an empty <value>", () => {
    expect(roundTrip('<condition attribute="a" operator="in"><value /><value></value></condition>')).toBe(
      '<condition attribute="a" operator="in"><value></value><value></value></condition>',
    );
  });

  test("link-entity with every allowed attribute and nested links", () => {
    const fragment = `<link-entity name="abc_matter" from="abc_matterid" to="abc_matter" alias="m" link-type="inner" visible="false" intersect="false">
        <filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>
        <link-entity name="account" from="accountid" to="abc_client" link-type="not any" />
      </link-entity>`;
    expect(roundTrip(fragment)).toBe(
      '<link-entity name="abc_matter" from="abc_matterid" to="abc_matter" alias="m" link-type="inner" visible="false" intersect="false">' +
        '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>' +
        '<link-entity name="account" from="accountid" to="abc_client" link-type="not any" /></link-entity>',
    );
  });

  test("conditions that use entityname and valueof", () => {
    expect(roundTrip("<condition entityname='m' attribute='a' operator='eq' valueof='b' />")).toBe(
      '<condition entityname="m" attribute="a" operator="eq" valueof="b" />',
    );
  });

  test("comments, which are dropped", () => {
    expect(roundTrip('<!-- active only --><condition attribute="statecode" operator="eq" value="0" /><!-- end -->')).toBe(
      '<condition attribute="statecode" operator="eq" value="0" />',
    );
  });

  test("an empty fragment (only whitespace or comments)", () => {
    expect(roundTrip("  \n <!-- nothing --> ")).toBe("");
  });

  test("entities and character references, and escapes them again on output", () => {
    expect(roundTrip('<condition attribute="name" operator="like" value="&lt;A&amp;B&gt; &quot;x&quot; &apos;y&apos; &#65;&#x42;" />')).toBe(
      '<condition attribute="name" operator="like" value="&lt;A&amp;B&gt; &quot;x&quot; &apos;y&apos; AB" />',
    );
    expect(roundTrip("<condition attribute='a' operator='in'><value>R&amp;D &lt;1&gt;</value></condition>")).toBe(
      '<condition attribute="a" operator="in"><value>R&amp;D &lt;1&gt;</value></condition>',
    );
  });

  test("whitespace inside tags", () => {
    expect(roundTrip('<condition\n  attribute = "a"\toperator="eq" value="1"\n/>')).toBe('<condition attribute="a" operator="eq" value="1" />');
  });
});

describe("parseFilterXml rejects", () => {
  test.each([
    ["<fetch><entity name='a' /></fetch>", "<fetch> isn't allowed here; use <condition>, <filter>, <link-entity>"],
    ["<attribute name='a' />", "<attribute> isn't allowed here"],
    ["<order attribute='a' />", "<order> isn't allowed here"],
    ["<filter><attribute name='a' /></filter>", "<attribute> isn't allowed in <filter>"],
    ["<link-entity name='a'><attribute name='b' /></link-entity>", "<attribute> isn't allowed in <link-entity>"],
    ["<condition attribute='a' operator='in'><condition attribute='b' operator='eq' /></condition>", "<condition> isn't allowed in <condition>"],
    ["<value>1</value>", "<value> isn't allowed here"],
    ["<condition attribute='a' operator='in'><value>1<value>2</value></value></condition>", "<value> isn't allowed in <value>; use no elements"],
  ])("elements outside the allow-list: %s", (fragment, expected) => {
    expect(reason(fragment)).toContain(expected);
  });

  test.each([
    ["<condition attribute='a' operator='eq' alias='x' />", '<condition> can\'t have a "alias" attribute'],
    ["<filter type='and' hint='union' />", '<filter> can\'t have a "hint" attribute'],
    ["<link-entity name='a' columns='b' />", '<link-entity> can\'t have a "columns" attribute'],
    ["<condition attribute='a' attribute='b' operator='eq' />", '<condition> has "attribute" twice'],
  ])("attributes outside the allow-list: %s", (fragment, expected) => {
    expect(reason(fragment)).toBe(expected);
  });

  test.each([
    ["<filter type='xor' />", '<filter type="xor"> isn\'t allowed; use and, or'],
    ["<link-entity name='a' link-type='left' />", '<link-entity link-type="left"> isn\'t allowed; use inner, outer'],
    ["<condition operator='eq' />", '<condition> needs a "attribute" attribute'],
    ["<condition attribute='a' />", '<condition> needs a "operator" attribute'],
    ["<link-entity from='a' to='b' />", '<link-entity> needs a "name" attribute'],
  ])("bad or missing attribute values: %s", (fragment, expected) => {
    expect(reason(fragment)).toContain(expected);
  });

  test.each([
    ["<filter>", "<filter> isn't closed"],
    ["<filter><condition attribute='a' operator='eq' /></link-entity>", "</link-entity> doesn't close <filter>"],
    ["</filter>", "</filter> doesn't close anything"],
    ["<condition attribute 'a' operator='eq' />", "expected \"=\""],
    ["<condition attribute='a operator='eq' />", '<condition> can\'t have a "eq" attribute'],
    ["<condition attribute=a operator='eq' />", "expected a quoted value"],
    ["<condition attribute='a", "an attribute value isn't closed"],
    ["<condition attribute='<a>' operator='eq' />", "an attribute value contains <"],
    ["<condition attribute='a' operator='eq' / >", "expected a name"],
    ["< condition />", "expected a name"],
    ["<!-- open", "a comment isn't closed"],
    ['<?xml version="1.0"?><condition attribute="a" operator="eq" />', "XML declarations, DOCTYPE and CDATA aren't allowed"],
    ["<![CDATA[x]]>", "XML declarations, DOCTYPE and CDATA aren't allowed"],
    ["statecode = 0", 'text ("statecode = 0") isn\'t allowed outside an element'],
    ["<filter>active</filter>", 'text ("active") isn\'t allowed in <filter>'],
    ["<condition attribute='a' operator='in'><value>1</value>x</condition>", 'text ("x") isn\'t allowed in <condition>'],
    ["<condition attribute='a' operator='in'><value>1", "<value> isn't closed"],
    ["<condition attribute='R&D' operator='eq' />", '"&" must be written as &amp;'],
    ["<condition attribute='a&nbsp;' operator='eq' />", 'unknown entity "&nbsp;"'],
    ["<condition attribute='&#x110000;' operator='eq' />", 'unknown entity "&#x110000;"'],
  ])("malformed XML: %s", (fragment, expected) => {
    expect(reason(fragment)).toContain(expected);
  });

  test("nesting deeper than 20 levels", () => {
    const deep = "<filter>".repeat(21) + "</filter>".repeat(21);
    expect(reason(deep)).toBe("elements are nested more than 20 deep");
    const ok = "<filter>".repeat(20) + "</filter>".repeat(20);
    expect(parseFilterXml(ok).ok).toBe(true);
  });

  test("rethrows anything that isn't a parse error", () => {
    const spy = jest.spyOn(String, "fromCodePoint").mockImplementation(() => {
      throw new TypeError("boom");
    });
    try {
      expect(() => parseFilterXml("<condition attribute='&#65;' operator='eq' />")).toThrow("boom");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("serializeXml", () => {
  test("escapes values a parsed tree could never hold, too", () => {
    expect(serializeXml([{ name: "condition", attributes: [["value", `"'<&>`]], children: [], text: null }])).toBe(
      '<condition value="&quot;&apos;&lt;&amp;&gt;" />',
    );
  });
});

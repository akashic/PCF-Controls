import { buildFetchXml, COUNT_ALIAS, GROUP_ALIAS } from "../ChoiceCounts/logic/fetchXml";
import { parseFilterXml } from "../ChoiceCounts/logic/filterXml";

const filter = (fragment: string) => {
  const parsed = parseFilterXml(fragment);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.nodes;
};

const base = { tableName: "abc_task", primaryIdColumn: "abc_taskid", groupColumn: "abc_ragstatus", filter: [], relationship: null };

const head =
  '<fetch aggregate="true"><entity name="abc_task">' +
  `<attribute name="abc_taskid" alias="${COUNT_ALIAS}" aggregate="countcolumn" distinct="true" />` +
  `<attribute name="abc_ragstatus" alias="${GROUP_ALIAS}" groupby="true" />`;
const tail = `<order alias="${GROUP_ALIAS}" /></entity></fetch>`;

describe("buildFetchXml", () => {
  test("counts distinct primary IDs per option, with no filter when there's none", () => {
    expect(buildFetchXml(base)).toBe(head + tail);
  });

  test("puts the maker's conditions in one and-filter", () => {
    expect(buildFetchXml({ ...base, filter: filter('<condition attribute="statecode" operator="eq" value="0" />') })).toBe(
      head + '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>' + tail,
    );
  });

  test("adds the relationship condition after the maker's, as in the brief's combined example", () => {
    const xml = buildFetchXml({
      ...base,
      filter: filter('<condition attribute="statecode" operator="eq" value="0" />'),
      relationship: { column: "abc_smsf", recordId: "a1b2c3d4-0000-4000-8000-00000000abcd" },
    });
    expect(xml).toBe(
      head +
        '<filter type="and"><condition attribute="statecode" operator="eq" value="0" />' +
        '<condition attribute="abc_smsf" operator="eq" value="a1b2c3d4-0000-4000-8000-00000000abcd" /></filter>' +
        tail,
    );
  });

  test("a relationship alone still gets a filter", () => {
    expect(buildFetchXml({ ...base, relationship: { column: "abc_smsf", recordId: "id" } })).toBe(
      head + '<filter type="and"><condition attribute="abc_smsf" operator="eq" value="id" /></filter>' + tail,
    );
  });

  test("moves top-level link-entities under <entity>, outside the filter", () => {
    const xml = buildFetchXml({
      ...base,
      filter: filter(
        '<link-entity name="abc_matter" from="abc_matterid" to="abc_matter" link-type="inner"><filter><condition attribute="statecode" operator="eq" value="0" /></filter></link-entity>' +
          '<filter type="or"><condition attribute="a" operator="null" /><condition attribute="b" operator="null" /></filter>',
      ),
    });
    expect(xml).toBe(
      head +
        '<link-entity name="abc_matter" from="abc_matterid" to="abc_matter" link-type="inner"><filter><condition attribute="statecode" operator="eq" value="0" /></filter></link-entity>' +
        '<filter type="and"><filter type="or"><condition attribute="a" operator="null" /><condition attribute="b" operator="null" /></filter></filter>' +
        tail,
    );
  });

  test("a filter of only link-entities needs no filter element", () => {
    expect(buildFetchXml({ ...base, filter: filter('<link-entity name="x" from="a" to="b" />') })).toBe(
      head + '<link-entity name="x" from="a" to="b" />' + tail,
    );
  });

  test("escapes every inserted value", () => {
    const xml = buildFetchXml({ ...base, relationship: { column: "abc_smsf", recordId: '"/><x a="' } });
    expect(xml).toContain('value="&quot;/&gt;&lt;x a=&quot;"');
  });

  test("doesn't change the caller's filter", () => {
    const nodes = filter('<condition attribute="a" operator="null" />');
    const before = JSON.stringify(nodes);
    buildFetchXml({ ...base, filter: nodes, relationship: { column: "r", recordId: "id" } });
    expect(JSON.stringify(nodes)).toBe(before);
  });
});

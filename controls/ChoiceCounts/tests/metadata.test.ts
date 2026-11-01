import {
  metadataPaths,
  optionsPath,
  readBooleanOptions,
  readEntityMetadata,
  readOptions,
  readWebApiKind,
  readWebApiOptions,
} from "../ChoiceCounts/logic/metadata";
import { groupColumnKind } from "../ChoiceCounts/logic/results";

const webLabel = (text: string) => ({ UserLocalizedLabel: { Label: text } });

/** getEntityMetadata's shape as GridFormatter found it: Attributes.get(column).attributeDescriptor. */
const pcfMetadata = (descriptor: unknown, primaryId: unknown = "wbsuper_SMSFTaskId") => ({
  PrimaryIdAttribute: primaryId,
  Attributes: { get: (name: string) => (name === "wbsuper_ragstatus" ? { attributeDescriptor: descriptor } : undefined) },
});

describe("readOptions", () => {
  test("reads value, label, colour and hidden in order, from PCF and Web API shapes", () => {
    expect(
      readOptions([
        { Value: 1, Label: "Red", Color: "#D13438" },
        { Value: "2", Label: webLabel("Amber"), Color: "", IsHidden: true },
        { Value: 3, Label: { LocalizedLabels: [{ Label: "Green" }] } },
        { Value: 4, Label: {} },
        { Value: 5 },
      ]),
    ).toEqual([
      { value: 1, label: "Red", color: "#D13438", hidden: false },
      { value: 2, label: "Amber", color: null, hidden: true },
      { value: 3, label: "Green", color: null, hidden: false },
      { value: 4, label: "4", color: null, hidden: false },
      { value: 5, label: "5", color: null, hidden: false },
    ]);
  });

  test("skips entries that aren't options, and returns null for a non-array", () => {
    expect(readOptions([null, "x", { Value: 1.5 }, { Value: "" }, { Value: 7, Label: "Seven" }])).toEqual([
      { value: 7, label: "Seven", color: null, hidden: false },
    ]);
    expect(readOptions(undefined)).toBeNull();
  });
});

describe("readBooleanOptions", () => {
  test("lists False then True", () => {
    expect(readBooleanOptions({ TrueOption: { Value: 1, Label: webLabel("Yes") }, FalseOption: { Value: 0, Label: webLabel("No"), Color: "#888888" } })).toEqual([
      { value: 0, label: "No", color: "#888888", hidden: false },
      { value: 1, label: "Yes", color: null, hidden: false },
    ]);
  });

  test("returns null when either option is missing, or for a non-object", () => {
    expect(readBooleanOptions({ TrueOption: { Value: 1 } })).toBeNull();
    expect(readBooleanOptions(null)).toBeNull();
  });
});

describe("readEntityMetadata", () => {
  test("reads the primary ID (lower-cased), kind and options", () => {
    const read = readEntityMetadata(pcfMetadata({ AttributeType: 11, OptionSet: [{ Value: 1, Label: "Red", Color: "#D13438" }] }), "wbsuper_ragstatus");
    expect(read).toEqual({ primaryIdColumn: "wbsuper_smsftaskid", kind: "choice", options: [{ value: 1, label: "Red", color: "#D13438", hidden: false }] });
  });

  test("reads AttributeTypeName, including a { Value } wrapper, and Yes/No options", () => {
    const yesNo = { AttributeTypeName: { Value: "BooleanType" }, OptionSet: { TrueOption: { Value: 1, Label: "Yes" }, FalseOption: { Value: 0, Label: "No" } } };
    expect(readEntityMetadata(pcfMetadata(yesNo), "wbsuper_ragstatus")).toMatchObject({ kind: "yesNo", options: [{ value: 0 }, { value: 1 }] });
    const yesNoAsList = { AttributeType: "Boolean", OptionSet: [{ Value: 0, Label: "No" }, { Value: 1, Label: "Yes" }] };
    expect(readEntityMetadata(pcfMetadata(yesNoAsList), "wbsuper_ragstatus")).toMatchObject({ kind: "yesNo", options: [{ value: 0 }, { value: 1 }] });
  });

  test("reports a kind that can't be grouped as null", () => {
    expect(readEntityMetadata(pcfMetadata({ AttributeType: "MultiSelectPicklistType" }), "wbsuper_ragstatus")).toEqual({ primaryIdColumn: "wbsuper_smsftaskid", kind: null });
  });

  test("leaves out whatever it can't find, so the Web API is asked for it", () => {
    expect(readEntityMetadata(pcfMetadata({ OptionSet: [] }, ""), "wbsuper_ragstatus")).toEqual({});
    expect(readEntityMetadata(pcfMetadata(undefined, 7), "other")).toEqual({});
    expect(readEntityMetadata(null, "x")).toEqual({});
    expect(readEntityMetadata({ Attributes: "not a collection" }, "x")).toEqual({});
  });

  test("uses getByName when get isn't there, and survives lookups that throw", () => {
    const byName = { Attributes: { getByName: () => ({ attributeDescriptor: { AttributeType: 13 } }) } };
    expect(readEntityMetadata(byName, "statuscode")).toEqual({ kind: "status" });
    const throwing = {
      get PrimaryIdAttribute(): string {
        throw new Error("no");
      },
      Attributes: {
        get: () => {
          throw new Error("no");
        },
        getByName: () => null,
      },
    };
    expect(readEntityMetadata(throwing, "x")).toEqual({});
    const throwingDescriptor = {
      Attributes: {
        get: () => ({
          get attributeDescriptor(): unknown {
            throw new Error("no");
          },
        }),
      },
    };
    expect(readEntityMetadata(throwingDescriptor, "x")).toEqual({});
  });
});

describe("Web API paths and readers", () => {
  test("builds the metadata paths", () => {
    expect(metadataPaths("wbsuper_smsftask", "wbsuper_ragstatus")).toEqual({
      table: "EntityDefinitions(LogicalName='wbsuper_smsftask')?$select=PrimaryIdAttribute",
      column: "EntityDefinitions(LogicalName='wbsuper_smsftask')/Attributes(LogicalName='wbsuper_ragstatus')?$select=AttributeType,AttributeTypeName",
    });
    expect(optionsPath("t", "c", "choice")).toBe(
      "EntityDefinitions(LogicalName='t')/Attributes(LogicalName='c')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet,GlobalOptionSet",
    );
    expect(optionsPath("t", "statuscode", "status")).toContain("StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet");
    expect(optionsPath("t", "statecode", "state")).toContain("StateAttributeMetadata");
    expect(optionsPath("t", "c", "yesNo")).toContain("BooleanAttributeMetadata");
  });

  test("reads the kind from AttributeTypeName, then AttributeType", () => {
    expect(readWebApiKind({ AttributeType: "Picklist", AttributeTypeName: { Value: "PicklistType" } })).toBe("choice");
    expect(readWebApiKind({ AttributeType: "Status" })).toBe("status");
    expect(readWebApiKind({ AttributeType: "Virtual", AttributeTypeName: { Value: "MultiSelectPicklistType" } })).toBeNull();
    expect(readWebApiKind("nope")).toBeNull();
  });

  test("reads options from a global choice first, then the local one", () => {
    const global = { GlobalOptionSet: { Options: [{ Value: 1, Label: webLabel("Red"), Color: "#D13438" }] }, OptionSet: { Options: [{ Value: 9, Label: webLabel("Local") }] } };
    expect(readWebApiOptions(global, "choice")).toEqual([{ value: 1, label: "Red", color: "#D13438", hidden: false }]);
    const local = { GlobalOptionSet: null, OptionSet: { Options: [{ Value: 9, Label: webLabel("Local") }] } };
    expect(readWebApiOptions(local, "choice")).toEqual([{ value: 9, label: "Local", color: null, hidden: false }]);
    const yesNo = { OptionSet: { TrueOption: { Value: 1, Label: webLabel("Yes") }, FalseOption: { Value: 0, Label: webLabel("No") } } };
    expect(readWebApiOptions(yesNo, "yesNo")).toMatchObject([{ value: 0 }, { value: 1 }]);
  });

  test("returns null when there are no options", () => {
    expect(readWebApiOptions({ OptionSet: { Options: [] } }, "choice")).toBeNull();
    expect(readWebApiOptions(null, "choice")).toBeNull();
  });
});

describe("readEntityMetadata with getEntityMetadata's real shape (decisions.md C-4)", () => {
  test("reads the descriptor's lower-case Type and a Yes/No option list", () => {
    const yesNo = { Type: "boolean", OptionSet: [{ Label: "No", Value: 0, IsHidden: false }, { Color: "#D13438", Label: "Yes", Value: 1, IsHidden: false }] };
    expect(readEntityMetadata(pcfMetadata(yesNo), "wbsuper_ragstatus")).toEqual({
      primaryIdColumn: "wbsuper_smsftaskid",
      kind: "yesNo",
      options: [
        { value: 0, label: "No", color: null, hidden: false },
        { value: 1, label: "Yes", color: "#D13438", hidden: false },
      ],
    });
    const choice = { Type: "picklist", OptionSet: [{ Color: "#D13438", Label: "Red", Value: 512340000, TransitionData: null, IsHidden: false }] };
    expect(readEntityMetadata(pcfMetadata(choice), "wbsuper_ragstatus")).toMatchObject({ kind: "choice", options: [{ value: 512340000, color: "#D13438" }] });
  });
});

describe("groupColumnKind", () => {
  test("accepts every source's type names in any case, and rejects the rest", () => {
    expect(["picklist", "status", "state", "boolean", "PicklistType", "BOOLEAN"].map(groupColumnKind)).toEqual(["choice", "status", "state", "yesNo", "choice", "yesNo"]);
    expect([11, 13, 12, 0].map(groupColumnKind)).toEqual(["choice", "status", "state", "yesNo"]);
    expect(["multiselectpicklist", "toString", 99, null, {}].map(groupColumnKind)).toEqual([null, null, null, null, null]);
  });

  test("accepts the Web API's plain type names", () => {
    expect(["Picklist", "Status", "State", "Boolean"].map(groupColumnKind)).toEqual(["choice", "status", "state", "yesNo"]);
  });
});

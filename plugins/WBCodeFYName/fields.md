# WBCodeFYName: tables and columns in dev

The dev environment's tables and columns that WBCodeFYName uses, read from the photos in [`Images/`](Images/) taken on 1 November 2026. This is a record of one environment, not configuration. The plug-in reads every name from its step configuration (see the [README](README.md)).

The maker portal's **Name** column shows the *schema* name, for example `wbsuper_FinancialYearId` and `wbsuper_Name`. The *logical* name is the same text in lower case, and that's what the step configuration and the Web API use.

## Step configuration for dev

```json
{
  "targetTable": "wbsuper_smsfmatter",
  "nameColumn": "wbsuper_wbcodefy",
  "wbCodeLookup": "wbsuper_wbcode",
  "wbCodeValueColumn": "wbsuper_wbcode",
  "fyLookup": "wbsuper_fy",
  "fyValueColumn": "wbsuper_name"
}
```

The photos don't show which tables the two lookups point to. The value columns above assume `wbsuper_wbcode` targets SuperFundClient and `wbsuper_fy` targets Financial Year. Confirm both in the lookups' relationship settings before registering the step (#59).

## SMSF Matter (`wbsuper_smsfmatter`)

The table the plug-in runs on. Its primary name column is WBCodeFY. Custom columns only ([IMG_2727](Images/IMG_2727.png)):

| Display name | Schema name | Data type | Plug-in role |
|---|---|---|---|
| FY | `wbsuper_fy` | Lookup | `fyLookup` |
| Internal Contact | `wbsuper_internalcontact` | Lookup | |
| Manager | `wbsuper_manager` | Lookup | |
| Preparer | `wbsuper_preparer` | Single line of text | |
| Progress Fee | `wbsuper_progressfee` | Currency | |
| Progress Fee (Base) | `wbsuper_progressfee_Base` | Currency | |
| Reviewer | `wbsuper_reviewer` | Lookup | |
| Stage | `wbsuper_stage` | Single line of text | |
| WBCode | `wbsuper_wbcode` | Lookup | `wbCodeLookup` |
| WBCodeFY (primary name) | `wbsuper_wbcodefy` | Single line of text | `nameColumn` |
| Wealth Advisory Contact | `wbsuper_wealthadvisoryc…` | Lookup | |

## SuperFundClient (`wbsuper_superfundclient`)

A super fund client, one row per WBCode. Its primary name column is WBCode. The dev table had 750 rows when photographed, and every WBCode shown ends in `70` ([IMG_2723](Images/IMG_2723.png)). Custom columns ([IMG_2725](Images/IMG_2725.png)):

| Display name | Schema name | Data type | Required | Plug-in role |
|---|---|---|---|---|
| ABN | `wbsuper_abn` | Single line of text | No | |
| Addressee | `wbsuper_addressee` | Single line of text | No | |
| ClientTerminationDate | `wbsuper_clienttermination…` | Date only | No | |
| ClientTypeId | `wbsuper_clienttypeid` | Whole number | Yes | |
| Email | `wbsuper_email` | Email | No | |
| Fund | `wbsuper_fund` | Single line of text | Yes | |
| FundNoted | `wbsuper_FundNoted` | Single line of text | No | |
| HomeEmail | `wbsuper_homeemail` | Email | No | |
| HomePhone | `wbsuper_homephone` | Phone number | No | |
| HomePhoneNotes | `wbsuper_homephonenotes` | Multiple lines of text | No | |
| LastUpdatedDate | `wbsuper_lastupdateddate` | Date and time | Yes | |
| Mobile | `wbsuper_mobile` | Phone number | No | |
| MobileNotes | `wbsuper_mobilenotes` | Multiple lines of text | No | |
| Partner | `wbsuper_partner` | Lookup | No | |
| PartnerEmail | `wbsuper_partneremail` | Email | No | |
| PartnerTerminationDate | `wbsuper_partnerterminati…` | Date only | No | |
| Salutation | `wbsuper_salutation` | Single line of text | No | |
| StatementEmail | `wbsuper_statementemail` | Email | No | |
| VaultClientId | `wbsuper_vaultclientid` | Whole number | Yes | |
| WBCode (primary name) | `wbsuper_wbcode` | Single line of text | Yes | `wbCodeValueColumn` |
| WorkPhone | `wbsuper_workphone` | Phone number | No | |
| WorkPhoneNotes | `wbsuper_workphonenotes` | Multiple lines of text | No | |

The data view also shows a column called SuperFundClient, which holds GUIDs. That's probably the primary key, `wbsuper_superfundclientid`, but the photos don't show its schema name.

## Financial Year (`wbsuper_financialyear`)

One row per financial year, named `FY25`, `FY26`, `FY27` and so on. Its primary name column is Name ([IMG_2721](Images/IMG_2721.png)). All columns ([IMG_2722](Images/IMG_2722.png)):

| Display name | Schema name | Data type | Required | Plug-in role |
|---|---|---|---|---|
| Name (primary name) | `wbsuper_Name` | Single line of text | Yes | `fyValueColumn` (as `wbsuper_name`) |
| Financial Year (primary key) | `wbsuper_FinancialYearId` | Unique identifier | Yes | |
| Start Date | `wbsuper_startdate` | Date only | No | |
| End Date | `wbsuper_enddate` | Date only | Yes | |
| Is Current | `wbsuper_iscurrent` | Yes/no | No | |
| Year | not shown | Whole number | | |

The photo also shows the standard system columns: CreatedBy, CreatedOn, CreatedOnBehalfBy, ModifiedBy, ModifiedOn, ModifiedOnBehalfBy, OwnerId, OwningBusinessUnit, OwningTeam, OwningUser, ImportSequenceNumber, OverriddenCreatedOn, statecode, statuscode, TimeZoneRuleVersionNumber, UTCConversionTimeZoneCode and VersionNumber.

The Year column (2025, 2026, 2027) appears in the data view but not in the column list, so its schema name isn't recorded.

Sample rows:

| Name | Start Date | End Date | Is Current | Year |
|---|---|---|---|---|
| FY25 | 01/07/2024 | 30/06/2025 | No | 2025 |
| FY26 | 01/07/2025 | 30/06/2026 | No | 2026 |
| FY27 | 01/07/2026 | 30/06/2027 | Yes | 2027 |

## Other `wbsuper_` tables

[IMG_2726](Images/IMG_2726.png) lists these tables, all custom and unmanaged. Only the three above matter to the plug-in.

`wbsuper_atosmartdocstask`, `wbsuper_ecagenttask`, `wbsuper_eccategory`, `wbsuper_ecconfig`, `wbsuper_ecemaileventlog`, `wbsuper_ecemaillog`, `wbsuper_ecmailboxfolders`, `wbsuper_ecrules`, `wbsuper_ecsupercentral`, `wbsuper_financialyear`, `wbsuper_smsf`, `wbsuper_smsfmatter`, `wbsuper_smsfstatus`, `wbsuper_superfundclient`, `wbsuper_superfundclientvi…` (a virtual table), `wbsuper_userpreference`, `wbsuper_vaultclients`.

A name ending in `…` was cut off in the photo.

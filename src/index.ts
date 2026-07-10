#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CUSTOMER_LIST_TEMPLATE,
  SALES_HISTORY_TEMPLATE,
  INVENTORY_SEARCH_TEMPLATE,
} from "./templates.js";
import { applyOverrides, decodeDiasparkResponse, Overrides } from "./xmlUtils.js";

const BASE_URL = process.env.DIASPARK_BASE_URL ?? "https://diasparkdemo.rw.diasparkonline.com";

async function postXml(path: string, xmlBody: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xmlBody,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Diaspark API request to ${url} failed: HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  return decodeDiasparkResponse(text);
}

function toolText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const server = new McpServer({
  name: "luxare-retail-mcp",
  version: "1.0.0",
});

/* ------------------------------------------------------------------ */
/* 1. Customer list / lookup                                          */
/* ------------------------------------------------------------------ */
server.tool(
  "list_customers",
  "Search the Diaspark customer list (terminal/terminal/list_customers_all). " +
    "All fields are optional filters; leave a field out to not filter on it.",
  {
    search_value: z.string().optional().describe("Generic/free-text search term"),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    company_id: z.union([z.string(), z.number()]).optional().describe("Defaults to 3"),
    billto_id: z.string().optional(),
    salesperson_code: z.string().optional(),
  },
  async (params) => {
    const overrides: Overrides = { ...params };
    const xml = applyOverrides(CUSTOMER_LIST_TEMPLATE, overrides);
    const result = await postXml("/terminal/terminal/list_customers_all", xml);
    return toolText(result);
  }
);

/* ------------------------------------------------------------------ */
/* 2. Sales history report                                            */
/* ------------------------------------------------------------------ */
server.tool(
  "sales_history_report",
  "Run the Diaspark sales receipt / item sales history report " +
    "(pos/point_of_sale_report/sales_receipt_with_item_report). " +
    "Dates use YYYY/MM/DD format. Use raw_overrides for any of the report's " +
    "other criteria fields (str1-str60, all1-all30, multiselect1-30, dec1-10, list1-10, etc).",
  {
    company_id: z.union([z.string(), z.number()]).optional().describe("Defaults to 7"),
    user_id: z.union([z.string(), z.number()]).optional().describe("Defaults to 1"),
    document_id: z.union([z.string(), z.number()]).optional().describe("Report definition id, defaults to 2679"),
    start_date: z.string().optional().describe("Transaction date range start (dt1), format YYYY/MM/DD"),
    end_date: z.string().optional().describe("Transaction date range end (dt2), format YYYY/MM/DD"),
    raw_overrides: z
      .record(z.union([z.string(), z.number(), z.null()]))
      .optional()
      .describe("Advanced: map of any other <tag> names in the criteria XML to raw values"),
  },
  async ({ start_date, end_date, raw_overrides, ...params }) => {
    const overrides: Overrides = {
      ...params,
      dt1: start_date,
      dt2: end_date,
      ...(raw_overrides ?? {}),
    };
    const xml = applyOverrides(SALES_HISTORY_TEMPLATE, overrides);
    const result = await postXml(
      "/pos/point_of_sale_report/sales_receipt_with_item_report",
      xml
    );
    return toolText(result);
  }
);

/* ------------------------------------------------------------------ */
/* 3. Inventory search (on-hand report by style)                      */
/* ------------------------------------------------------------------ */
// Friendly field name -> [fromTag, toTag], derived from the report's column
// definitions (OnHandStockReportBySerialCriteriaStru.xml). Passing a single
// value sets both the "from" and "to" tag to that value (exact match).
const INVENTORY_FIELD_MAP: Record<string, [string, string]> = {
  classification: ["str1", "str2"],
  group: ["str3", "str4"],
  brand: ["str5", "str6"],
  category: ["str7", "str8"],
  sku: ["str9", "str10"],
  serial: ["str11", "str12"],
  location: ["str13", "str14"],
  vendor: ["str19", "str20"],
  store: ["str21", "str22"],
  vendor_style: ["str23", "str24"],
  department: ["str29", "str30"],
  rmsa: ["str31", "str32"],
  collection: ["str33", "str34"],
  subcategory: ["str39", "str40"],
  group_code: ["str41", "str42"],
  designer: ["str43", "str44"],
  upc: ["str51", "str52"],
};

server.tool(
  "inventory_search",
  "Run the Diaspark on-hand-by-style inventory report " +
    "(inventory/inventory_report/on_hand_report_by_style). " +
    "Friendly filter fields (sku, serial, brand, category, vendor, store, location, " +
    "department, subcategory, group, group_code, classification, collection, designer, " +
    "vendor_style, rmsa, upc) each do an exact-match filter when provided. " +
    "Use raw_overrides for anything else (e.g. the all1-all30 'select all' toggle flags, " +
    "date ranges, or multiselect fields) - see the report's column definitions for the " +
    "full str#/all# field mapping.",
  {
    company_id: z.union([z.string(), z.number()]).optional().describe("Defaults to 7"),
    document_id: z.union([z.string(), z.number()]).optional().describe("Report definition id, defaults to 3215"),
    classification: z.string().optional(),
    group: z.string().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    sku: z.string().optional(),
    serial: z.string().optional(),
    location: z.string().optional(),
    vendor: z.string().optional(),
    store: z.string().optional(),
    vendor_style: z.string().optional(),
    department: z.string().optional(),
    rmsa: z.string().optional(),
    collection: z.string().optional(),
    subcategory: z.string().optional(),
    group_code: z.string().optional(),
    designer: z.string().optional(),
    upc: z.string().optional(),
    raw_overrides: z
      .record(z.union([z.string(), z.number(), z.null()]))
      .optional()
      .describe("Advanced: map of any other <tag> names in the criteria XML to raw values"),
  },
  async ({ company_id, document_id, raw_overrides, ...friendly }) => {
    const overrides: Overrides = {
      company_id,
      document_id,
    };

    for (const [field, value] of Object.entries(friendly)) {
      if (value === undefined) continue;
      const mapped = INVENTORY_FIELD_MAP[field];
      if (!mapped) continue;
      const [fromTag, toTag] = mapped;
      overrides[fromTag] = value;
      overrides[toTag] = value;
    }

    Object.assign(overrides, raw_overrides ?? {});

    const xml = applyOverrides(INVENTORY_SEARCH_TEMPLATE, overrides);
    const result = await postXml(
      "/inventory/inventory_report/on_hand_report_by_style",
      xml
    );
    return toolText(result);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

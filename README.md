# luxare-retail-mcp

An MCP (Model Context Protocol) server that exposes three Diaspark
(`diasparkonline.com`) reporting/lookup APIs as tools an MCP-compatible
client (e.g. Claude Desktop, Claude Code) can call.

## Tools

| Tool | Endpoint | Purpose |
|---|---|---|
| `list_customers` | `POST /terminal/terminal/list_customers_all` | Search the customer list by name, city, email, phone, etc. |
| `sales_history_report` | `POST /pos/point_of_sale_report/sales_receipt_with_item_report` | Sales receipt / item sales history report over a date range. |
| `inventory_search` | `POST /inventory/inventory_report/on_hand_report_by_style` | On-hand inventory report, filterable by SKU, serial #, brand, category, vendor, store, location, etc. |

All requests are sent as `Content-Type: application/xml` POST bodies. No
authentication is required against the demo environment currently
configured (`https://diasparkdemo.rw.diasparkonline.com`).

## How it works

Each Diaspark endpoint expects a large, mostly-static XML payload (see
`src/templates.ts`, copied verbatim from the sample requests). Rather than
generating XML from scratch, each tool takes a known-good template and
only overwrites the specific `<tag>` values relevant to the fields you
pass in — every other default/hidden field the API depends on is left
untouched.

- `list_customers` — nearly every field maps 1:1 to a tag (`first_name`, `last_name`, `city`, ...).
- `sales_history_report` — exposes `company_id`, `user_id`, `document_id`, `start_date` (→ `dt1`), `end_date` (→ `dt2`), plus a `raw_overrides` object for any other criteria field (`str1`-`str60`, `all1`-`all30`, `dec1`-`dec10`, `multiselect1`-`30`, etc).
- `inventory_search` — exposes friendly names (`sku`, `serial`, `brand`, `category`, `vendor`, `store`, `location`, `department`, `subcategory`, `group`, `group_code`, `classification`, `collection`, `designer`, `vendor_style`, `rmsa`, `upc`) that are mapped to the underlying `strN`/`strN+1` "from/to" tag pairs (derived from the report's column definitions), plus `raw_overrides` for anything else.

Passing a friendly inventory field sets both the "from" and "to" tag to
that value, i.e. an exact-match filter. If a filter doesn't seem to take
effect, the report may also require its corresponding `allN` "select all"
checkbox flag to be turned off — pass that via `raw_overrides` (e.g.
`{ "all5": "N" }`). The full column-to-tag mapping is documented in the
original `OnHandStockReportBySerialCriteriaStru.xml` column definitions
file if you need to extend this further.

`applyOverrides` (in `src/xmlUtils.ts`) throws if you reference a tag name
that doesn't exist anywhere in the template, so typos in `raw_overrides`
fail loudly instead of being silently ignored.

## Setup

```bash
npm install
npm run build
```

## Configuration

By default the server targets the demo environment:

```
https://diasparkdemo.rw.diasparkonline.com
```

To point at a different environment (e.g. production), set the
`DIASPARK_BASE_URL` environment variable.

### Claude Desktop / Claude Code MCP config

Add to your MCP config file (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "luxare-retail": {
      "command": "node",
      "args": ["/absolute/path/to/luxare-retail-mcp/build/index.js"],
      "env": {
        "DIASPARK_BASE_URL": "https://diasparkdemo.rw.diasparkonline.com"
      }
    }
  }
}
```

Restart Claude Desktop / Claude Code after editing the config.

## Adding more endpoints

To add another Diaspark API as a tool:

1. Add its sample request body as a new exported template string in `src/templates.ts`.
2. Add a new `server.tool(...)` block in `src/index.ts`, listing the
   fields you want to expose as friendly parameters (map them to the
   underlying tag names), plus a `raw_overrides` escape hatch.
3. `npm run build` and restart your MCP client.

## Example tool calls

```json
// list_customers
{ "first_name": "david", "company_id": 3 }

// sales_history_report
{ "company_id": 7, "start_date": "2026/07/01", "end_date": "2026/07/10" }

// inventory_search
{ "company_id": 7, "sku": "ABC123" }
```

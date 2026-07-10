/**
 * Small helper for editing the fixed-shape Diaspark XML request bodies.
 *
 * These endpoints expect a large, mostly-static XML document where only a
 * handful of fields differ per request. Rather than parsing/rebuilding the
 * whole document (and risking dropping a field the API silently depends
 * on), we take the known-good template and surgically replace individual
 * tag contents.
 */

import { inflateSync } from "node:zlib";

export type Overrides = Record<string, string | number | null | undefined>;

const ENCODED_BODY_RE = /^<encoded>([\s\S]*?)<\/encoded>\s*$/;

/**
 * Diaspark wraps some report/list responses as <encoded>{base64(zlib(xml))}</encoded>
 * (the Ruby-side equivalent is Zlib::Inflate.inflate(Base64.decode64(a))). Unwrap
 * that here so tools always return plain XML; pass through unchanged otherwise.
 */
export function decodeDiasparkResponse(body: string): string {
  const match = body.match(ENCODED_BODY_RE);
  if (!match) return body;

  const buffer = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  return inflateSync(buffer).toString("utf8");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Replace the contents of <tag>...</tag> or <tag/> with `value`.
 * If `value` is undefined, the tag is left untouched.
 * If `value` is null or an empty string, the tag is emptied (self-closed).
 * Returns the updated XML plus whether the tag was actually found.
 */
function setTag(xml: string, tag: string, value: string | number | null | undefined): { xml: string; found: boolean } {
  if (value === undefined) return { xml, found: true };

  const selfClosing = new RegExp(`<${tag}\\s*/>`);
  const withContent = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`);

  const isEmpty = value === null || value === "";
  const replacement = isEmpty ? `<${tag}/>` : `<${tag}>${escapeXml(String(value))}</${tag}>`;

  if (selfClosing.test(xml)) {
    return { xml: xml.replace(selfClosing, replacement), found: true };
  }
  if (withContent.test(xml)) {
    return { xml: xml.replace(withContent, replacement), found: true };
  }
  return { xml, found: false };
}

/**
 * Apply a map of { tagName: value } overrides onto a base XML template.
 * Throws if a requested tag name doesn't exist anywhere in the template,
 * so typos surface immediately instead of being silently ignored.
 */
export function applyOverrides(template: string, overrides: Overrides): string {
  let xml = template;
  const missing: string[] = [];

  for (const [tag, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const result = setTag(xml, tag, value);
    xml = result.xml;
    if (!result.found) missing.push(tag);
  }

  if (missing.length > 0) {
    throw new Error(`Unknown field name(s) not present in template: ${missing.join(", ")}`);
  }

  return xml;
}

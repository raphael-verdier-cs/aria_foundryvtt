import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../css/aria.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector) {
  const result = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(",").some(value => value.trim() === selector)) continue;
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1)
        .replace(/\s*!important\s*$/, "").trim();
    }
  }
  return result;
}

function luminance(color) {
  assert.match(color ?? "", /^#[\da-f]{3}(?:[\da-f]{3})?$/i, `Expected an explicit reading color: ${color}`);
  const hex = color.length === 4 ? [...color.slice(1)].map(value => value.repeat(2)).join("") : color.slice(1);
  const rgb = hex.match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function assertReadable(foreground, background, label) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
}

test("should pair every forced-white reading surface with a dark foreground", () => {
  for (const selector of [
    ".sheet.journal-entry .journal-entry-content",
    ".editor.prosemirror",
    ".editor.prosemirror .editor-content",
    ".mce-content-body",
  ]) {
    const style = declarations(selector);
    assert.equal(style.background, "#fff");
    assertReadable(style.color, style.background, selector);
  }
});

test("should keep all journal heading levels readable on paper", () => {
  for (let level = 1; level <= 6; level++) {
    const selector = `.journal-page-content h${level}`;
    assertReadable(declarations(selector).color, "#fff", selector);
  }
});

test("should keep native journal page titles readable at every outline level", () => {
  for (let level = 1; level <= 6; level++) {
    const selector = `.journal-page-header h${level}`;
    assertReadable(declarations(selector).color, "#fff", selector);
  }
});

test("should keep read-aloud and both secret states readable", () => {
  const quote = declarations(".journal-page-content .aria-texte");
  assertReadable(quote.color, quote.background, "read-aloud text");
  assertReadable(declarations(".journal-page-content .aria-texte h3").color, quote.background, "read-aloud heading");
  const secret = declarations(".journal-page-content .secret");
  assertReadable(secret.color, secret.background, "secret text");
  assertReadable(declarations(".journal-page-content .secret h3").color, secret.background, "secret heading");
  assertReadable(secret.color, declarations(".journal-page-content .secret.revealed").background, "revealed secret");
});

test("should keep table headers and striped or highlighted rows readable on paper", () => {
  const table = declarations(".journal-page-content table");
  const header = declarations(".journal-page-content table thead");
  assertReadable(table.color, table.background, "table body");
  assertReadable(header.color, header.background, "table header");
  for (const state of ["even", "highlight"]) {
    assertReadable(table.color, table[`--table-row-color-${state}`], `${state} table row`);
  }
  assert.equal(table["--table-row-color-odd"], "transparent");
});

test("should give journal and editor prose a readable size and line spacing", () => {
  for (const selector of [".journal-page-content", ".editor.prosemirror .editor-content", ".mce-content-body"]) {
    const style = declarations(selector);
    assert.equal(style["font-size"], "16px");
    assert.equal(style["line-height"], "1.5");
  }
});

test("should wrap long journal links and table words in narrow reading panes", () => {
  for (const selector of [".journal-page-content", ".editor.prosemirror .editor-content", ".mce-content-body"]) {
    assert.equal(declarations(selector)["overflow-wrap"], "anywhere");
    assert.equal(declarations(`${selector} .content-link`)["white-space"], "normal");
  }
});

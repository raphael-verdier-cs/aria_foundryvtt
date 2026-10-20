import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { installFoundryMocks } from "./support/foundry-mocks.mjs";

const runtime = installFoundryMocks();
const originalDocument = globalThis.document;
const originalRoll = globalThis.Roll;
const originalChatMessage = globalThis.ChatMessage;
const originalEnrichHTML = globalThis.TextEditor.enrichHTML;
const originalSettingsSet = game.settings.set;
const testI18nFormat = (key, values) => key === "ARIA.specialAbilityRoll.notice.failure"
  ? `${key}:${values.reason}`
  : `${key}:${values.label}:${values.formula}:${values.threshold ?? ""}`;
const modulePath = new URL("../module/actors/special-ability-rolls.js", import.meta.url).href;
const { executeSpecialAbilityRoll, extractSpecialAbilitySection, getSpecialAbilityRolls } = await import(modulePath);
const { AriaActorSheet } = await import(new URL("../module/actors/actor-sheet.js", import.meta.url).href);
const characterStatsTemplate = readFileSync(
  new URL("../templates/actors/character/parts/stats/character-stats.hbs", import.meta.url),
  "utf8",
);

game.i18n.format = testI18nFormat;

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.Roll = originalRoll;
  globalThis.ChatMessage = originalChatMessage;
  globalThis.TextEditor.enrichHTML = originalEnrichHTML;
  game.i18n.format = testI18nFormat;
  game.settings.set = originalSettingsSet;
  runtime.resetCalls();
});

const decodeEntities = text => text
  .replace(/&nbsp;/gi, "\u00a0")
  .replace(/&eacute;/gi, "é")
  .replace(/&Eacute;/g, "É")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, "\"")
  .replace(/&#(?:39|x27);/gi, "'");

const createTextNode = text => ({
  nodeType: 3,
  textContent: decodeEntities(text),
  childNodes: [],
});

const createElement = tagName => {
  const element = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: [],
    appendChild(child) {
      this.childNodes.push(child);
      return child;
    },
    get textContent() {
      return this.childNodes.map(child => child.textContent).join("");
    },
  };
  return element;
};

const parseFixtureHtml = html => {
  const root = {
    nodeType: 11,
    childNodes: [],
    appendChild(child) {
      this.childNodes.push(child);
      return child;
    },
  };
  const stack = [root];
  const tokens = html.match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      const tagName = token.match(/^<\/\s*([a-z][a-z0-9]*)/i)?.[1]?.toUpperCase();
      while (stack.length > 1) {
        const element = stack.pop();
        if (element.tagName === tagName) break;
      }
      continue;
    }
    if (token.startsWith("<")) {
      const tagName = token.match(/^<\s*([a-z][a-z0-9]*)/i)?.[1];
      if (!tagName) continue;
      const element = stack.at(-1).appendChild(createElement(tagName));
      if (!/^(?:br|hr|img|input)$/i.test(tagName) && !/\/>$/.test(token)) stack.push(element);
      continue;
    }
    stack.at(-1).appendChild(createTextNode(token));
  }
  return root;
};

const createDocument = () => ({
  createElement(tagName) {
    assert.equal(tagName, "template");
    const template = { content: null };
    Object.defineProperty(template, "innerHTML", {
      set(html) {
        template.content = parseFixtureHtml(html);
      },
    });
    return template;
  },
});

const competence = ({ id, name, score, bonus = 0, type = "competence" }) => ({
  id,
  _id: id,
  name,
  type,
  system: { score, bonus },
  labels: [],
});

const collection = items => Object.assign([...items], {
  get(id) {
    return this.find(item => item.id === id || item._id === id);
  },
});

const specialSection = body => `<h2>Comp&eacute;tences&nbsp;sp&eacute;ciales</h2>${body}<h2>Propri&eacute;t&eacute;s</h2><p>9d9</p>`;

const makeRollClass = calls => class {
  constructor(formula) {
    this.formula = formula;
    calls.push(["construct", formula]);
  }

  async evaluate(options) {
    calls.push(["evaluate", options]);
    this.total = 17;
    return this;
  }

  async toMessage(data, options) {
    calls.push(["toMessage", data, options]);
    return { data, options };
  }
};

const makeActor = (description, items = []) => ({
  id: "synthetic-actor",
  name: "Synthetic",
  isOwner: true,
  system: { description },
  items: collection(items),
});

const makeSheet = ({ description, items = [], editable = true, owner = true }) => {
  const sheet = Object.create(AriaActorSheet.prototype);
  const actorItems = collection(items);
  sheet.actor = {
    ...makeActor(description, items),
    isOwner: owner,
    items: actorItems,
    limited: false,
    toObject() {
      return { system: { description }, items: items.map(item => item.toObject?.() ?? structuredClone(item)) };
    },
  };
  sheet.options = { editable };
  sheet.isEditable = editable;
  return sheet;
};

test("should extract only the normalized French special-ability section", () => {
  const html = `<h2>Before</h2><p>ignored</p>${specialSection(
    "<p>Élan&nbsp;: 50 %</p><h3>Sub-section</h3><p>jet brut 1d6</p>",
  )}`;

  const section = extractSpecialAbilitySection(html, createDocument());

  assert.deepEqual(section, ["Élan : 50 %", "Sub-section", "jet brut 1d6"]);
});

test("should return no section when the heading or description is absent", () => {
  const document = createDocument();

  assert.deepEqual(extractSpecialAbilitySection("<h2>Compétences</h2><p>1d6</p>", document), []);
  assert.deepEqual(extractSpecialAbilitySection("", document), []);
  assert.deepEqual(extractSpecialAbilitySection("<h2>Compétences spéciales</h2>", {}), []);
  assert.deepEqual(extractSpecialAbilitySection("<h2>Compétences spéciales</h2>", {
    createElement: () => ({ content: null }),
  }), []);
});

test("should build raw dice, explicit ability-threshold, and same-Actor skill actions", () => {
  const html = specialSection([
    "<p>Arc ancien : 50 %; bonus conditionnel +15%; quantité 1d20 et durée 2d4+3.</p>",
    "<p>Faire un jet de Perception.</p>",
  ].join(""));
  const items = [competence({ id: "skill-1", name: "Perception", score: 65, bonus: "+5" })];

  const result = getSpecialAbilityRolls(html, items, createDocument());

  assert.deepEqual(result.actions.map(({ kind, formula, threshold, label }) => ({
    kind, formula, threshold, label,
  })), [
    { kind: "ability", formula: "1d100", threshold: 50, label: "Arc ancien" },
    { kind: "dice", formula: "1d20", threshold: undefined, label: "ARIA.specialAbilityRoll.rawLabel" },
    { kind: "dice", formula: "2d4+3", threshold: undefined, label: "ARIA.specialAbilityRoll.rawLabel" },
    { kind: "skill", formula: "1d100", threshold: 70, label: "Perception" },
  ]);
  assert.equal(result.actions[3].itemId, "skill-1");
  assert.deepEqual(result.notices, ["ARIA.specialAbilityRoll.notice.manual"]);
});

test("should accept dice only within literal formula bounds", () => {
  const formulas = [
    ["1d2", true],
    ["20d1000+1000", true],
    ["1D6", true],
    ["1d6 + 1", true],
    ["0d6", false],
    ["21d6", false],
    ["1d1", false],
    ["1d1001", false],
    ["1d6+1001", false],
    ["2d6*4", false],
    ["1d6+1d4", false],
    ["1d6 + 1d4", false],
    ["+ 1d4", false],
    ["1d6 +", false],
    ["1d6 + 4", true],
    ["1d6.5", false],
    ["+1d6", false],
    ["1d6+@actor.level", false],
    ["1d6 trailing", true],
    ["1d6abc", false],
  ];

  for (const [formula, valid] of formulas) {
    const result = getSpecialAbilityRolls(specialSection(`<p>${formula}</p>`), [], createDocument());
    assert.equal(result.actions.some(action => action.kind === "dice"), valid, formula);
    if (formula === "1D6") assert.equal(result.actions[0].formula, "1d6");
    if (formula === "1d6 + 1") assert.equal(result.actions[0].formula, "1d6+1");
    if (formula === "1d6 + 4") assert.equal(result.actions[0].formula, "1d6+4");
    if (!valid) assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.manual"), formula);
  }
});

test("should preserve separate raw dice formulas in one paragraph", () => {
  const result = getSpecialAbilityRolls(
    specialSection("<p>Quantité 1d6+1 et durée 2d4.</p>"),
    [],
    createDocument(),
  );

  assert.deepEqual(result.actions.map(action => action.formula), ["1d6+1", "2d4"]);
});

test("should not turn signed or unlabeled conditional percentages into thresholds", () => {
  const result = getSpecialAbilityRolls(
    specialSection("<p>Ability : 50%; bonus +15%; si requis 20%.</p>"),
    [],
    createDocument(),
  );

  assert.deepEqual(result.actions.map(action => action.threshold), [50]);
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.manual"));
});

test("should keep blank and conditional percentage labels as prose", () => {
  const result = getSpecialAbilityRolls(
    specialSection("<p> : 50%; Pour la cible : 20%; Capacité : 0%.</p>"),
    [],
    createDocument(),
  );

  assert.deepEqual(result.actions.map(action => action.threshold), [0]);
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.manual"));
});

test("should accept explicit unsigned references despite question marks and later chance prose", () => {
  const exact = getSpecialAbilityRolls(
    specialSection("<p>Question préalable ? Capacité du barde ? : 40%; Arc ancien : 50%; chance de réussite évaluée séparément.</p>"),
    [],
    createDocument(),
  );
  assert.deepEqual(exact.actions.map(({ label, threshold }) => ({ label, threshold })), [
    { label: "Capacité du barde ?", threshold: 40 },
    { label: "Arc ancien", threshold: 50 },
  ]);
  assert.deepEqual(exact.notices, []);

  const signed = getSpecialAbilityRolls(
    specialSection("<p>Arc : +15%; Malédiction : -10%.</p>"),
    [],
    createDocument(),
  );
  assert.deepEqual(signed.actions, []);
  assert.ok(signed.notices.includes("ARIA.specialAbilityRoll.notice.manual"));

  const chance = getSpecialAbilityRolls(
    specialSection("<p>Réussite du pigeonnier : 5% de chance.</p>"),
    [],
    createDocument(),
  );
  assert.deepEqual(chance.actions.map(({ label, threshold }) => ({ label, threshold })), [
    { label: "Réussite du pigeonnier", threshold: 5 },
  ]);
});

test("should reject ability percentages outside the supported range", () => {
  const result = getSpecialAbilityRolls(
    specialSection("<p>Overdrive : 101%</p>"),
    [],
    createDocument(),
  );

  assert.equal(result.actions.length, 0);
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.manual"));
});

test("should not resolve unknown, victim, or opposed skill checks", () => {
  const html = specialSection([
    "<p>Faire un jet de Perception.</p>",
    "<p>La victime peut faire un jet de Psychologie opposé.</p>",
    "<p>Faire un jet pour voir si cela fonctionne.</p>",
    "<p>Réussir un jet sous endurance.</p>",
  ].join(""));
  const items = [
    competence({ id: "perception", name: "Perception", score: 45 }),
    competence({ id: "psychology", name: "Psychologie", score: 99 }),
  ];

  const result = getSpecialAbilityRolls(html, items, createDocument());

  assert.deepEqual(result.actions.map(action => action.itemId), ["perception"]);
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.target"));
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.manual"));
});

test("should ignore non-competence Items and malformed scores", () => {
  const html = specialSection("<p>Faire un jet de Perception.</p>");
  const items = [
    competence({ id: "weapon", name: "Perception", score: 80, type: "item" }),
    competence({ id: "invalid", name: "Perception", score: "80abc" }),
  ];

  const result = getSpecialAbilityRolls(html, items, createDocument());

  assert.equal(result.actions.length, 0);
  assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.target"));
});

test("should resolve iterable competences and safely handle unsupported collections", () => {
  const description = specialSection("<p>Faire un jet de Perception.</p>");
  const item = competence({ id: "iterable-perception", name: "Perception", score: "45", bonus: "+2" });

  const fromSet = getSpecialAbilityRolls(description, new Set([item]), createDocument());
  assert.equal(fromSet.actions[0].itemId, "iterable-perception");
  assert.equal(fromSet.actions[0].threshold, 47);

  const fromContents = getSpecialAbilityRolls(description, { contents: [item] }, createDocument());
  assert.equal(fromContents.actions[0].itemId, "iterable-perception");

  const nonIterableFunction = () => {};
  for (const items of [null, "not an item collection", {}, nonIterableFunction]) {
    const result = getSpecialAbilityRolls(description, items, createDocument());
    assert.equal(result.actions.length, 0);
    assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.target"));
  }
});

test("should reject ambiguous and malformed competence records", () => {
  const description = specialSection("<p>Faire un jet de Perception.</p>");
  const itemCases = [
    [competence({ id: "negative", name: "Perception", score: -1 })],
    [competence({ id: "decimal", name: "Perception", score: 50.5 })],
    [competence({ id: "over", name: "Perception", score: 101 })],
    [competence({ id: "unsafe-integer", name: "Perception", score: "9007199254740992" })],
    [{ type: "competence", id: "missing-score", name: "Perception", system: { bonus: 0 } }],
    [competence({ id: "bad-bonus", name: "Perception", score: 50, bonus: "5 points" })],
    [competence({ id: "bad-id", name: "Perception", score: 50, bonus: 9007199254740991 })],
    [{ type: "competence", name: 12, system: { score: 50, bonus: 0 }, id: "bad-name" }],
    [null],
    [{ type: "competence", name: "Perception", system: { score: 50, bonus: 0 } }],
    [{ type: "competence", id: "", name: "Perception", system: { score: 50, bonus: 0 } }],
    [
      competence({ id: "duplicate-1", name: "Perception", score: 50 }),
      competence({ id: "duplicate-2", name: "Perception", score: 60 }),
    ],
    [{ type: "competence", _id: "legacy-id", name: "Perception", system: { score: 50, bonus: 0 } }],
  ];

  for (const items of itemCases.slice(0, -1)) {
    const result = getSpecialAbilityRolls(description, items, createDocument());
    assert.equal(result.actions.length, 0);
    assert.ok(result.notices.includes("ARIA.specialAbilityRoll.notice.target"));
  }
  const legacy = getSpecialAbilityRolls(description, [itemCases.at(-1)[0]], createDocument());
  assert.equal(legacy.actions[0].itemId, "legacy-id");
});

test("should match only a whole named competence prefix", () => {
  const item = competence({ id: "perception", name: "Perception", score: 50 });

  const phrase = getSpecialAbilityRolls(
    specialSection("<p>Faire un jet de Perception pour repérer la trace.</p>"),
    [item],
    createDocument(),
  );
  assert.equal(phrase.actions[0].itemId, "perception");

  const partial = getSpecialAbilityRolls(
    specialSection("<p>Faire un jet de PerceptionX.</p>"),
    { contents: "not an array" },
    createDocument(),
  );
  assert.equal(partial.actions.length, 0);
  assert.ok(partial.notices.includes("ARIA.specialAbilityRoll.notice.target"));
});

test("should report an absent section as a non-editing notice", () => {
  const result = getSpecialAbilityRolls("<p>1d6</p>", [], createDocument());

  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.notices, ["ARIA.specialAbilityRoll.notice.noSection"]);
  assert.equal(result.hasPanelContent, false);
  assert.match(characterStatsTemplate, /\{\{#if specialAbilityRolls\.hasPanelContent\}\}[\s\S]*?<section class="special-ability-roll-panel"/);
  assert.match(characterStatsTemplate, /<\/section>\s*\{\{\/if\}\}/);
});

test("should show the panel when actions or explanatory notices exist", () => {
  const actionResult = getSpecialAbilityRolls(
    specialSection("<p>Arc ancien : 50%.</p>"),
    [],
    createDocument(),
  );
  const noticeResult = getSpecialAbilityRolls(
    specialSection("<p>Arc ancien : +15%.</p>"),
    [],
    createDocument(),
  );
  const plainTextResult = getSpecialAbilityRolls(
    specialSection("<p>Descriptif sans référence calculable.</p>"),
    [],
    createDocument(),
  );

  assert.equal(actionResult.hasPanelContent, true);
  assert.equal(noticeResult.hasPanelContent, true);
  assert.equal(plainTextResult.hasPanelContent, false);
});

test("should execute one fresh, non-interactive self-only roll with explicit Actor speaker", async () => {
  const description = specialSection("<p>Arc &amp; &quot;l&#39;ancien&quot; &lt;test&gt; : 50%</p>");
  const actor = makeActor(description);
  const action = getSpecialAbilityRolls(description, [], createDocument()).actions[0];
  const calls = [];
  const RollClass = makeRollClass(calls);
  const ChatMessageClass = {
    applyMode() {},
    getSpeaker({ actor: speakerActor }) {
      return { actor: speakerActor.id };
    },
  };
  const settingsWrites = [];
  game.settings.set = (...args) => settingsWrites.push(args);

  await executeSpecialAbilityRoll({
    actor,
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass,
    ChatMessageClass,
  });

  assert.deepEqual(calls, [
    ["construct", "1d100"],
    ["evaluate", { allowInteractive: false }],
    ["toMessage", {
      speaker: { actor: "synthetic-actor" },
      flavor: "ARIA.specialAbilityRoll.flavor.reference:Arc &amp; &quot;l&#39;ancien&quot; &lt;test&gt;:1d100:50",
    }, { messageMode: "self" }],
  ]);
  assert.deepEqual(settingsWrites, []);
});

test("should validate and privately execute a derived skill action", async () => {
  const description = specialSection("<p>Faire un jet de Perception.</p>");
  const actor = makeActor(description, [competence({
    id: "perception",
    name: "Perception",
    score: 45,
    bonus: "+3",
  })]);
  const action = getSpecialAbilityRolls(description, actor.items, createDocument()).actions[0];
  const calls = [];

  await executeSpecialAbilityRoll({
    actor,
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass: makeRollClass(calls),
    ChatMessageClass: {
      applyMode() {},
      getSpeaker: ({ actor: speakerActor }) => ({ actor: speakerActor.id }),
    },
  });

  assert.deepEqual(calls[2][2], { messageMode: "self" });
  assert.match(calls[2][1].flavor, /Perception.*1d100.*48/);
});

test("should use the compatible selfroll option when native applyMode is unavailable", async () => {
  const action = {
    id: "dice-1",
    kind: "dice",
    label: "Jet brut",
    formula: "1d6",
  };
  const calls = [];

  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass: makeRollClass(calls),
    ChatMessageClass: { getSpeaker: () => ({ actor: "synthetic-actor" }) },
  });

  assert.deepEqual(calls[2][2], { rollMode: "selfroll" });
});

test("should reject stale, unauthorized, and invalid action requests without rolling", async () => {
  const calls = [];
  const RollClass = makeRollClass(calls);
  const ChatMessageClass = { getSpeaker: () => ({}) };
  const action = { id: "raw-1", kind: "dice", label: "Raw", formula: "1d6" };

  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: "stale",
    definitions: [action],
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: { ...makeActor(""), isOwner: false },
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [action],
    editable: false,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [{ ...action, formula: "1d6+@actor.level" }],
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: null,
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [null, { ...action, id: "other" }],
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: { not: "an array" },
    editable: true,
    RollClass,
    ChatMessageClass,
  });
  await executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: "invalid-ability",
    definitions: [{ id: "invalid-ability", kind: "ability", formula: "1d100", label: "Invalid", threshold: 101 }],
    editable: true,
    RollClass,
    ChatMessageClass,
  });

  assert.deepEqual(calls, []);
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, 8);
});

test("should reject every unsupported native roll definition shape", async () => {
  const calls = [];
  const invalidActions = [
    { id: "ability-formula", kind: "ability", formula: "2d6", label: "Ability", threshold: 50 },
    { id: "ability-label", kind: "ability", formula: "1d100", label: 12, threshold: 50 },
    { id: "ability-fraction", kind: "ability", formula: "1d100", label: "Ability", threshold: 1.5 },
    { id: "ability-negative", kind: "ability", formula: "1d100", label: "Ability", threshold: -1 },
    { id: "ability-high", kind: "ability", formula: "1d100", label: "Ability", threshold: 101 },
    { id: "skill-formula", kind: "skill", formula: "2d6", label: "Skill", threshold: 50, itemId: "skill" },
    { id: "skill-label", kind: "skill", formula: "1d100", label: 12, threshold: 50, itemId: "skill" },
    { id: "skill-threshold", kind: "skill", formula: "1d100", label: "Skill", threshold: 1.5, itemId: "skill" },
    { id: "skill-item-type", kind: "skill", formula: "1d100", label: "Skill", threshold: 50, itemId: 12 },
    { id: "skill-item-empty", kind: "skill", formula: "1d100", label: "Skill", threshold: 50, itemId: "" },
    { id: "unknown-kind", kind: "unknown", formula: "1d6", label: "Unknown" },
  ];
  const invalidFunction = Object.assign(() => {}, { id: "function" });
  invalidActions.push(invalidFunction);

  for (const action of invalidActions) {
    await executeSpecialAbilityRoll({
      actor: makeActor(""),
      actionId: action.id,
      definitions: [action],
      editable: true,
      RollClass: makeRollClass(calls),
      ChatMessageClass: { getSpeaker: () => ({}) },
    });
  }

  assert.deepEqual(calls, []);
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, invalidActions.length);
});

test("should report native roll failures without creating another message", async () => {
  const calls = [];
  const failure = new Error("synthetic roll failure");
  class FailedRoll {
    constructor(formula) {
      calls.push(["construct", formula]);
    }
    async evaluate() {
      calls.push(["evaluate"]);
      throw failure;
    }
  }
  const action = { id: "raw-1", kind: "dice", label: "Jet brut", formula: "1d6" };

  await assert.rejects(executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass: FailedRoll,
    ChatMessageClass: { getSpeaker: () => ({}) },
  }), error => error === failure);

  assert.deepEqual(calls, [["construct", "1d6"], ["evaluate"]]);
  assert.deepEqual(runtime.mockCalls.filter(([kind]) => kind === "notification"), [
    ["notification", "ARIA.specialAbilityRoll.notice.failure:synthetic roll failure"],
  ]);
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, 0);
});

test("should report and rethrow non-Error native roll failures", async () => {
  const failure = "synthetic non-Error failure";
  class FailedRoll {
    async evaluate() {
      throw failure;
    }
  }
  const action = { id: "raw-1", kind: "dice", label: "Jet brut", formula: "1d6" };

  await assert.rejects(executeSpecialAbilityRoll({
    actor: makeActor(""),
    actionId: action.id,
    definitions: [action],
    editable: true,
    RollClass: FailedRoll,
    ChatMessageClass: { getSpeaker: () => ({}) },
  }), error => error === failure);

  assert.deepEqual(runtime.mockCalls.filter(([kind]) => kind === "notification"), [
    ["notification", "ARIA.specialAbilityRoll.notice.failure:synthetic non-Error failure"],
  ]);
});

test("should derive the panel without changing Actor description or Items", async () => {
  const description = specialSection("<p>Arc ancien : 55%</p><p>Faire un jet de Perception.</p>");
  const items = [competence({ id: "perception", name: "Perception", score: 60, bonus: "+2" })];
  const sourceSnapshot = structuredClone({ description, items });
  const sheet = makeSheet({ description, items });
  const enrichedInputs = [];
  globalThis.TextEditor.enrichHTML = async (source, options) => {
    enrichedInputs.push([source, options]);
    return `unchanged-enrichment:${source}`;
  };
  globalThis.document = createDocument();

  const data = await sheet.getData();

  assert.equal(data.system.description, description);
  assert.equal(data.biographyHTML, `unchanged-enrichment:${description}`);
  assert.equal(data.specialAbilityRolls.actions[0].threshold, 55);
  assert.equal(data.specialAbilityRolls.actions[1].threshold, 62);
  assert.deepEqual(enrichedInputs[0][0], description);
  assert.deepEqual({ description: sheet.actor.system.description, items }, sourceSnapshot);
});

test("should hide secret roll metadata and reject clicks for observers and read-only owners", async () => {
  const description = specialSection("<p>Secret Technique : 73%</p>");
  const enrichedInputs = [];
  globalThis.document = createDocument();
  globalThis.TextEditor.enrichHTML = async (source, options) => {
    enrichedInputs.push([source, options]);
    return "filtered secret biography";
  };
  const calls = [];
  globalThis.Roll = makeRollClass(calls);
  globalThis.ChatMessage = { getSpeaker: () => ({}) };

  for (const options of [
    { owner: false, editable: true },
    { owner: true, editable: false },
  ]) {
    const sheet = makeSheet({ description, ...options });
    const data = await sheet.getData();

    assert.deepEqual(data.specialAbilityRolls, {
      actions: [],
      notices: [],
      hasPanelContent: false,
      editable: false,
    });
    assert.equal(JSON.stringify(data.specialAbilityRolls).includes("Secret Technique"), false);
    assert.equal(JSON.stringify(data.specialAbilityRolls).includes("73"), false);
    await sheet._onSpecialAbilityRoll({
      preventDefault() {},
      currentTarget: { dataset: { rollId: "secret-control" } },
    });
  }

  assert.equal(enrichedInputs[0][1].secrets, false);
  assert.equal(enrichedInputs[1][1].secrets, true);
  assert.deepEqual(calls, []);
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, 2);
});

test("should tolerate a missing description during sheet rendering and click handling", async () => {
  const sheet = makeSheet({ description: undefined });
  sheet.actor.system = {};
  globalThis.document = createDocument();
  globalThis.TextEditor.enrichHTML = async source => `unchanged:${source ?? ""}`;

  const data = await sheet.getData();
  assert.deepEqual(data.specialAbilityRolls.actions, []);
  assert.ok(data.specialAbilityRolls.notices.includes("ARIA.specialAbilityRoll.notice.noSection"));

  await sheet._onSpecialAbilityRoll({
    preventDefault() {},
    currentTarget: { dataset: {} },
  });
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, 1);
});

test("should bind scoped roll buttons to freshly derived definitions", async () => {
  const description = specialSection("<p>Arc ancien : 50%</p>");
  const actor = makeActor(description);
  const sheet = makeSheet({ description });
  sheet.actor = actor;
  sheet.options = { editable: true };
  sheet.isEditable = true;
  globalThis.document = createDocument();
  const listeners = {};
  const html = {
    find(selector) {
      return {
        click(handler) {
          if (selector === ".special-ability-roll") listeners.click = handler;
        },
        contextmenu() {},
        change() {},
      };
    },
  };
  const action = getSpecialAbilityRolls(description, [], createDocument()).actions[0];
  const calls = [];
  globalThis.Roll = makeRollClass(calls);
  globalThis.ChatMessage = {
    applyMode() {},
    getSpeaker: ({ actor: speakerActor }) => ({ actor: speakerActor.id }),
  };

  sheet.activateListeners(html);
  await listeners.click({
    preventDefault() {},
    currentTarget: { dataset: { rollId: action.id } },
  });
  await listeners.click({ preventDefault() {} });
  await listeners.click({ preventDefault() {}, currentTarget: {} });

  assert.equal(calls[0][0], "construct");
  assert.deepEqual(calls[2][2], { messageMode: "self" });
  assert.equal(calls.length, 3);
  assert.equal(runtime.mockCalls.filter(([kind]) => kind === "warning").length, 2);
});

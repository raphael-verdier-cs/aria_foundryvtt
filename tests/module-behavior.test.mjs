import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { installFoundryMocks } from "./support/foundry-mocks.mjs";

const runtime = installFoundryMocks();
const defaultSettingsGet = game.settings.get;
const defaultSettingsSet = game.settings.set;
const defaultDollar = globalThis.$;
afterEach(() => {
  game.settings.get = defaultSettingsGet;
  game.settings.set = defaultSettingsSet;
  globalThis.$ = defaultDollar;
});
const modulePath = name => new URL(`../module/${name}.js`, import.meta.url).href;
const [
  config,
  helpers,
  data,
  traversal,
  arrays,
  strings,
  updates,
  actorModule,
  actorSheetModule,
  characterSheetModule,
  lootSheetModule,
  itemModule,
  globalItemSheetModule,
  itemSheetModule,
  competenceModule,
  professionModule,
  originsModule,
  rollModule,
  damageModule,
  initiativeModule,
  skillModule,
  statsModule,
  macrosModule,
  cardsModule,
  playerHandModule,
  cardMenuModule,
  systemReadyModule,
  chatModule,
  settingsModule,
  templatesModule,
  editorModule,
  tokenModule,
  hooksModule,
  rootModule,
] = await Promise.all([
  "config", "helpers", "data", "utils/traversal", "utils/array-utils",
  "utils/string-utils", "utils/update-utils", "actors/actor", "actors/actor-sheet",
  "actors/character-sheet", "actors/loot-sheet", "items/item", "items/globalitem-sheet",
  "items/item-sheet", "controllers/competence", "controllers/profession",
  "controllers/origines", "controllers/roll", "system/dmg-roll", "system/init-roll",
  "system/skill-roll", "system/stats", "system/macros", "cards/cards", "cards/player-hand",
  "cards/cardSettingMenu", "hooks/system-ready", "chat", "settings", "templates", "editor", "token",
  "hooks/hotbar-drop", "aria",
].map(name => import(modulePath(name))));

const item = (type, name, system = {}, overrides = {}) => ({
  id: `${type}-${name}`,
  _id: `${type}-${name}`,
  type,
  name,
  system,
  sort: 0,
  labels: [],
  toObject: () => structuredClone({ type, name, system, _id: `${type}-${name}`, sort: 0 }),
  ...overrides,
});

const collection = values => Object.assign([...values], {
  get(id) { return this.find(value => value.id === id || value._id === id); },
  get size() { return this.length; },
});

const cardCollection = values => ({
  contents: values,
  get(id) { return values.find(card => card.id === id); },
  get size() { return values.length; },
});

const handAction = (action, cardId) => {
  const row = cardId === undefined ? null : {
    dataset: { cardId },
    classList: {
      toggled: null,
      toggle(name) { this.toggled = name; },
    },
  };
  const target = {
    dataset: { action },
    closest(selector) {
      if (selector === "li[data-card-id]" || selector === "li.card") return row;
      return selector === "[data-action]" ? this : null;
    },
  };
  return {
    row,
    target,
    event: {
      currentTarget: { dataset: { action: "decoy" } },
      target: { closest: selector => selector === "[data-action]" ? target : null },
    },
  };
};

const createHandFixture = ({ cards = [], document = {} } = {}) => {
  const handDocument = {
    id: "hand-1",
    type: "hand",
    cards: cardCollection(cards),
    nativeActions: [],
    drawDialog: async () => handDocument.nativeActions.push(["draw-dialog"]),
    passDialog: async () => handDocument.nativeActions.push(["pass-dialog"]),
    playDialog: async card => handDocument.nativeActions.push(["play-dialog", card]),
    ...document,
  };
  const hand = new playerHandModule.AriaPlayerHand({ document: handDocument });
  return { hand, document: handDocument };
};

const withDataLoaderRuntime = async callback => {
  const originals = {
    fetch: globalThis.fetch,
    Item: globalThis.Item,
    Actor: globalThis.Actor,
    System: globalThis.System,
    findPack: game.packs.find,
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.Item = originals.Item;
    globalThis.Actor = originals.Actor;
    globalThis.System = originals.System;
    game.packs.find = originals.findPack;
  }
};

const createCompendiumPack = ({ collection: collectionId, documentName, locked = true, documents = [], events = [] }) => {
  let lockState = locked;
  return {
    collection: collectionId,
    documentName,
    get locked() {
      return lockState;
    },
    configure: async ({ locked: nextLockState }) => {
      events.push(`configure:${nextLockState}`);
      lockState = nextLockState;
    },
    getDocuments: async () => {
      events.push("getDocuments");
      return documents;
    },
  };
};

const recursivelyListFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? recursivelyListFiles(path) : [path];
});

const ariaPresetDefinitions = [
  ["Info", "aria-info"],
  ["Texte", "aria-block aria-texte"],
  ["Règle", "aria-block aria-regle"],
  ["Point clé", "aria-block aria-point-cle"],
  ["Secret", "secret aria-block aria-secret"],
  ["Quête principale", "aria-block aria-quete-principale"],
  ["Quête parallèle", "aria-block aria-quete-parallele"],
  ["Quête personnelle", "aria-block aria-quete-personnelle"],
  ["Quête principale fin", "aria-block aria-quete-principale-fin"],
  ["Quête parallèle fin", "aria-block aria-quete-parallele-fin"],
  ["Quête personnelle fin", "aria-block aria-quete-personnelle-fin"],
  ["Quête résolue", "aria-block aria-quete-resolue"],
  ["Quête Personnage Exception", "aria-block aria-quete-exception"],
  ["Quête Alchimiste", "aria-block aria-quete-alchimiste"],
  ["Quête Magicien", "aria-block aria-quete-magicien"],
  ["Quête Noble", "aria-block aria-quete-noble"],
  ["Quête Combattant", "aria-block aria-quete-combattant"],
  ["Quête Dieu Ennemi", "aria-block aria-quete-ennemi"],
];

const mockElement = (attributes = {}) => ({
  attributes: Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, { value }])),
});

test("configuration defines stable system identifiers and selectable item metadata", () => {
  assert.equal(config.System.name, "aria");
  assert.equal(config.System.dataPath, "/systems/aria/_data");
  assert.equal(config.ARIA.itemTypes.competence, "ARIA.category.competence");
  assert.equal(config.ARIA.languages.common, "ARIA.languages.Common");
  assert.ok(Object.keys(config.ARIA.itemSubCategories).includes("melee"));
});

test("configuration caches each version's profession, origin, and competency documents", async () => {
  const getDocuments = key => async () => [{ toObject: () => ({ key }) }];
  const packs = new Map();
  game.packs.get = name => ({
    getDocuments: getDocuments(name),
  });
  game.settings.get = (namespace, key) => key === "ariaVersion" ? globalThis.__version : undefined;
  game.aria.config = config.ARIA;
  globalThis.__version = "aria";
  await config.ARIA.getProfessions();
  await config.ARIA.getOrigines();
  await config.ARIA.getCompetences();
  await config.ARIA.getCompetencesSpe();
  assert.equal(config.ARIA.professions.length, 3);
  assert.deepEqual(config.ARIA.origines.map(doc => doc.key), ["aria.origines"]);
  assert.deepEqual(config.ARIA.competences.map(doc => doc.key), ["aria.competences"]);
  assert.equal(config.ARIA.competencesSpe.length, 2);
  globalThis.__version = "stars";
  await config.ARIA.getProfessions();
  await config.ARIA.getOrigines();
  await config.ARIA.getCompetences();
  await config.ARIA.getCompetencesSpe();
  assert.deepEqual(config.ARIA.professions.map(doc => doc.key), ["aria.professionsstars"]);
  assert.deepEqual(config.ARIA.origines.map(doc => doc.key), ["aria.originesstars"]);
  assert.deepEqual(config.ARIA.competences.map(doc => doc.key), ["aria.competencesstars"]);
  assert.deepEqual(config.ARIA.competencesSpe.map(doc => doc.key), ["aria.competencesspepretirestars"]);
  globalThis.__version = "custom";
  await config.ARIA.getCompetencesSpe();
  assert.deepEqual(config.ARIA.competencesSpe.map(doc => doc.key), ["aria.competencesspepretirestars"]);
  globalThis.__version = "contemporain";
  await config.ARIA.getProfessions();
  await config.ARIA.getOrigines();
  await config.ARIA.getCompetences();
  assert.deepEqual(config.ARIA.professions.map(doc => doc.key), ["aria.professionscont"]);
  assert.deepEqual(config.ARIA.origines.map(doc => doc.key), ["aria.originescont"]);
  assert.deepEqual(config.ARIA.competences.map(doc => doc.key), ["aria.competencescont"]);
  globalThis.__version = "aria";
  void packs;
});

test("array utilities remove matching entries and report id membership", () => {
  const values = ["first", "second", "third"];
  arrays.ArrayUtils.remove(values, "second");
  arrays.ArrayUtils.remove(values, "missing");
  assert.deepEqual(values, ["first", "third"]);
  const entities = [{ _id: "a" }, { _id: "b" }];
  arrays.ArrayUtils.removeObjectById(entities, "b");
  arrays.ArrayUtils.removeObjectById(entities, "missing");
  assert.deepEqual(entities, [{ _id: "a" }]);
  assert.equal(arrays.ArrayUtils.findById(entities, "a"), true);
  assert.equal(arrays.ArrayUtils.findById(entities, "missing"), false);
});

test("string utilities normalize accents, build keys, and hash UTF-8 strings", async () => {
  assert.equal(strings.StringUtils.normalize("Épée D'Argent"), "epee d'argent");
  assert.equal(strings.StringUtils.toKey("Épée; D'Argent"), "epee-d-argent");
  assert.equal(await strings.StringUtils.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("traversal resolves world entities before packs and combines configured data", async () => {
  const worldItem = { id: "world" };
  const packItem = { id: "pack" };
  game.items = collection([{ type: "competence", toObject: () => ({ from: "world" }) }]);
  game.actors = collection([{ id: "actor" }]);
  game.journal = collection([{ id: "journal" }]);
  game.packs = {
    get: () => ({
      getDocument: async id => id === "pack" ? packItem : undefined,
      getDocuments: async () => [packItem],
    }),
  };
  assert.equal(await traversal.Traversal.getEntity("world", "item"), undefined);
  game.items.get = id => id === "world" ? worldItem : undefined;
  assert.equal(await traversal.Traversal.getEntity("world", "item", "pack"), worldItem);
  assert.equal(await traversal.Traversal.getEntity("pack", "item", "pack"), packItem);
  assert.equal(await traversal.Traversal.getEntity("actor", "actor"), game.actors.get("actor"));
  assert.equal(await traversal.Traversal.getEntity("journal", "journal"), game.journal.get("journal"));
  game.aria.config = {
    competences: [{ from: "base" }],
    competencesSpe: [{ from: "special" }],
    professions: [{ from: "profession" }],
    origines: [{ from: "origin" }],
  };
  assert.deepEqual(await traversal.Traversal.getAllEntitiesOfType("competence", "pack"), [game.items[0], packItem]);
  assert.deepEqual(traversal.Traversal.getItemsOfType("competence"), [
    { from: "world" }, { from: "base" },
  ]);
  assert.deepEqual(traversal.Traversal.getItemsOfType("unknown"), []);
  assert.deepEqual(traversal.Traversal.getInGameEntitiesDataOfType("competence"), [{ from: "world" }]);
  assert.deepEqual(traversal.Traversal.getAllCompetencesData(), [
    { from: "world" }, { from: "base" }, { from: "special" },
  ]);
  assert.deepEqual(traversal.Traversal.getAllProfessionsData(), [
    { from: "profession" },
  ]);
  assert.deepEqual(traversal.Traversal.getAllOriginesData(), [
    { from: "origin" },
  ]);
});

test("update utility entry points remain callable pending implementation", () => {
  assert.equal(updates.UpdateUtils.updateCompetences(), undefined);
  assert.equal(updates.UpdateUtils.updateProfessions(), undefined);
  assert.equal(updates.UpdateUtils.updateOrigines(), undefined);
});

test("handlebars helpers register category, item, competency, and comparison behavior", () => {
  const inventory = [
    item("item", "Zebra", { subtype: "melee", properties: { weapon: true }, equiped: true }),
    item("item", "Apple", { subtype: "melee", properties: { weapon: false }, equiped: false }),
    item("item", "Other", { subtype: "", properties: { weapon: false }, equiped: true }),
    item("item", "Miscellaneous", { subtype: "", properties: { weapon: false }, equiped: false }),
    item("competence", "Special", { special: true, key: "special" }),
    item("competence", "Normal", { special: false, key: "normal" }),
    item("profession", "Profession"),
    item("origine", "Origin"),
  ];
  helpers.registerHandlebarsHelpers();
  const h = runtime.helpers;
  assert.equal(h.get("getOrigines")(inventory), inventory[7]);
  assert.deepEqual(h.get("getInventory")(inventory).map(value => value.name), ["Miscellaneous", "Other", "Apple", "Zebra"]);
  const descendingInventory = [...inventory].reverse();
  assert.deepEqual(h.get("getInventory")(descendingInventory).map(value => value.name), ["Miscellaneous", "Other", "Apple", "Zebra"]);
  const groups = h.get("getArraySubCategorywithItems")(inventory);
  assert.equal(groups.find(group => group.key === "melee").items.length, 2);
  assert.deepEqual(groups.find(group => group.key === "").items.map(value => value.name), ["Miscellaneous", "Other"]);
  const descendingGroups = h.get("getArraySubCategorywithItems")(descendingInventory);
  assert.deepEqual(descendingGroups.find(group => group.key === "melee").items.map(value => value.name), ["Apple", "Zebra"]);
  assert.deepEqual(descendingGroups.find(group => group.key === "").items.map(value => value.name), ["Miscellaneous", "Other"]);
  assert.equal(h.get("getItemSubCategories")(), config.ARIA.itemSubCategories);
  assert.equal(h.get("getItemsBySubCategory")("melee", inventory).length, 2);
  assert.deepEqual(h.get("getItemsBySubCategory")("melee", descendingInventory).map(value => value.name), ["Apple", "Zebra"]);
  assert.deepEqual(h.get("getEquiped")(inventory).map(value => value.name), ["Other", "Zebra"]);
  assert.deepEqual(h.get("getEquiped")(descendingInventory).map(value => value.name), ["Other", "Zebra"]);
  assert.equal(h.get("getItems")(inventory).length, 4);
  assert.equal(h.get("getProfession")(inventory), inventory[6]);
  assert.deepEqual(h.get("getCompetences")(inventory).map(value => value.name), ["Normal"]);
  assert.deepEqual(h.get("getCompetencesSpe")(inventory).map(value => value.name), ["Special"]);
  assert.deepEqual(h.get("getWeapons")(inventory).map(value => value.name), ["Zebra", "Apple"]);
  assert.deepEqual(h.get("getEquipedWeapons")(inventory).map(value => value.name), ["Zebra"]);
  assert.equal(h.get("useMagic")({ items: [
    item("competence", "Modélisation", { special: true }),
    item("competence", "Saut", { special: false }),
  ] }), true);
  assert.equal(h.get("isWeapon")(inventory[0]), true);
  assert.equal(h.get("isWeapon")(inventory[3]), false);
  assert.equal(h.get("splitWeaponDice")("2d6+3"), "2d6");
  assert.equal(h.get("splitWeaponMod")("2d6+3"), "3");
  assert.equal(h.get("isNull")(null), true);
  assert.equal(h.get("isEmpty")([]), true);
  assert.equal(h.get("isEmpty")(null), 0);
  assert.equal(h.get("notEmpty")([1]), true);
  assert.equal(h.get("isZeroOrNull")(0), true);
  assert.equal(h.get("isNegative")(-1), true);
  assert.equal(h.get("isNegativeOrNull")(0), true);
  assert.equal(h.get("isPositive")(1), true);
  assert.equal(h.get("isPositiveOrNull")(0), true);
  assert.equal(h.get("equals")(1, "1"), true);
  assert.equal(h.get("gt")(2, 1), true);
  assert.equal(h.get("lt")(1, 2), true);
  assert.equal(h.get("gte")(2, 2), true);
  assert.equal(h.get("lte")(2, 2), true);
  assert.equal(h.get("and")(true, "yes"), "yes");
  assert.equal(h.get("or")(false, "yes"), "yes");
  assert.equal(h.get("not")(false), true);
  assert.equal(h.get("isEnabled")("missing"), undefined);
  runtime.settings.set("aria.ariaVersion", "aria");
  assert.equal(h.get("isAriaTypeSetting")("aria"), true);
  assert.equal(h.get("split")("a,b", ",", 1), "b");
  assert.deepEqual(h.get("listProfessions")(), traversal.Traversal.getAllProfessionsData());
  assert.deepEqual(h.get("listOrigines")(), traversal.Traversal.getAllOriginesData());
  game.items = collection([item("competence", "Normal", { key: "normal" })]);
  assert.equal(h.get("findCompetence")("normal")?.name, "Normal");
  assert.equal(h.get("concat")("a", 1, {}, "b"), "a1b");
  assert.equal(h.get("add")("2", "3"), 5);
  assert.equal(h.get("valueAtIndex")(["x"], 0), "x");
  assert.equal(h.get("includesKey")(inventory, "competence", "normal"), true);
  assert.equal(h.get("ifequal")(2, 2, { fn: () => "yes", inverse: () => "no" }), "yes");
  assert.equal(h.get("ifequal")(2, 3, { fn: () => "yes", inverse: () => "no" }), "no");
  assert.equal(h.get("isActorHand")({ getDefaultHand: () => ({ id: "hand" }) }, "hand"), true);
  assert.equal(h.get("isActorDeck")({ getDefaultDeck: () => ({ id: "deck" }) }, "deck"), true);
  assert.equal(h.get("isActorDiscard")({ getDefaultDiscard: () => ({ id: "discard" }) }, "discard"), true);
});

test("data loader finds packs and clears documents without swallowing failures", async () => withDataLoaderRuntime(async () => {
  globalThis.fetch = async path => ({ ok: true, json: async () => ({ path }) });
  assert.deepEqual(await data.DataLoader.loadJson("data.json"), { path: "data.json" });
  const pack = { collection: "aria.test" };
  game.packs.find = predicate => predicate(pack) ? pack : undefined;
  assert.equal(data.DataLoader.findPack("test"), pack);

  const deleted = [];
  assert.equal(await data.DataLoader.clearPack({
    collection: "aria.test",
    getDocuments: async () => [
      { id: "one", delete: async () => deleted.push("one") },
      { id: "two", delete: async () => deleted.push("two") },
    ],
  }), true);
  assert.deepEqual(deleted, ["one", "two"]);
  await assert.rejects(data.DataLoader.clearPack({
    collection: "aria.test",
    getDocuments: async () => [{ delete: async () => { throw new Error("delete denied"); } }],
  }), error => error.message.includes('Failed to clear compendium pack "aria.test"')
    && error.cause.message === "delete denied");
  await assert.rejects(data.DataLoader.clearPack({
    collection: "aria.test",
    getDocuments: async () => { throw new Error("read denied"); },
  }), error => error.message.includes('Failed to clear compendium pack "aria.test"')
    && error.cause.message === "read denied");
}));

test("data loader validates then imports item and actor documents directly into packs", async () => withDataLoaderRuntime(async () => {
  const events = [];
  const created = [];
  const validated = [];
  class TestItem extends globalThis.Item {
    constructor(data) {
      super();
      this.data = data;
    }
    validate(options) {
      validated.push(["Item", this.data, options]);
      return true;
    }
    static async create() {
      throw new Error("Item.create must not persist imports into the world.");
    }
    static async createDocuments(documents, options) {
      events.push("create:Item");
      created.push({ entity: "Item", documents, options });
    }
  }
  class TestActor extends globalThis.Actor {
    constructor(data) {
      super();
      this.data = data;
    }
    validate(options) {
      validated.push(["Actor", this.data, options]);
      return true;
    }
    static async create() {
      throw new Error("Actor.create must not persist imports into the world.");
    }
    static async createDocuments(documents, options) {
      events.push("create:Actor");
      created.push({ entity: "Actor", documents, options });
    }
  }
  globalThis.Item = TestItem;
  globalThis.Actor = TestActor;
  globalThis.System = config.System;

  const itemPack = createCompendiumPack({
    collection: "aria.item",
    documentName: "Item",
    locked: true,
    documents: [{ delete: async () => events.push("delete:old-item") }],
    events,
  });
  const actorPack = createCompendiumPack({
    collection: "aria.actor",
    documentName: "Actor",
    locked: false,
    events,
  });
  const packs = [itemPack, actorPack];
  game.packs.find = predicate => packs.find(predicate);
  globalThis.fetch = async filepath => {
    events.push(`fetch:${filepath}`);
    if (filepath === "direct.json") {
      return { ok: true, json: async () => ({ path: filepath }) };
    }
    return {
      ok: true,
      json: async () => filepath.endsWith("/item.json")
        ? [{ name: "Imported item" }, { name: "Second item" }]
        : { name: "Imported actor" },
    };
  };

  assert.deepEqual(await data.DataLoader.loadJson("direct.json"), { path: "direct.json" });
  await data.DataLoader.loadData("item");
  await data.DataLoader.loadData("actor");

  assert.deepEqual(created, [
    { entity: "Item", documents: [{ name: "Imported item" }, { name: "Second item" }], options: { pack: "aria.item" } },
    { entity: "Actor", documents: [{ name: "Imported actor" }], options: { pack: "aria.actor" } },
  ]);
  assert.deepEqual(validated, [
    ["Item", { name: "Imported item" }, { strict: true }],
    ["Item", { name: "Second item" }, { strict: true }],
    ["Actor", { name: "Imported actor" }, { strict: true }],
  ]);
  assert.equal(itemPack.locked, true);
  assert.equal(actorPack.locked, false);
  assert.deepEqual(events, [
    "fetch:direct.json",
    "fetch:/systems/aria/_data/item.json",
    "configure:false",
    "getDocuments",
    "delete:old-item",
    "create:Item",
    "configure:true",
    "fetch:/systems/aria/_data/actor.json",
    "getDocuments",
    "create:Actor",
  ]);
}));

test("data loader rejects missing packs, unsupported types, and malformed records before clearing", async () => withDataLoaderRuntime(async () => {
  const events = [];
  class TestItem extends globalThis.Item {
    constructor(data) {
      super();
      this.data = data;
    }
    validate(options) {
      events.push("validate");
      assert.deepEqual(options, { strict: true });
      if (typeof this.data.name !== "string") {
        throw new Error("Invalid Item name.");
      }
      return true;
    }
    static async createDocuments() {
      events.push("create");
    }
  }
  globalThis.Item = TestItem;
  globalThis.System = config.System;
  let requestedContent;
  let responseStatus = 200;
  let jsonCalls = 0;
  globalThis.fetch = async () => {
    events.push("fetch");
    return {
      ok: responseStatus === 200,
      status: responseStatus,
      json: async () => {
        jsonCalls++;
        return requestedContent;
      },
    };
  };

  game.packs.find = () => undefined;
  await assert.rejects(data.DataLoader.loadData("missing"), /Compendium pack "missing" was not found/);
  assert.ok(runtime.mockCalls.some(([action, message]) => action === "notification"
    && message.includes('Compendium pack "missing"')));

  const unsupportedPack = createCompendiumPack({
    collection: "aria.unsupported",
    documentName: "JournalEntry",
    events,
  });
  game.packs.find = predicate => predicate(unsupportedPack) ? unsupportedPack : undefined;
  await assert.rejects(data.DataLoader.loadData("unsupported"), /Unsupported compendium document type "JournalEntry"/);
  assert.deepEqual(events, []);

  const pack = createCompendiumPack({
    collection: "aria.item",
    documentName: "Item",
    events,
  });
  game.packs.find = predicate => predicate(pack) ? pack : undefined;
  for (const invalidContent of [[], null, 7, [{}, []], { name: 42 }]) {
    requestedContent = invalidContent;
    await assert.rejects(
      data.DataLoader.loadData("item"),
      /Import data must contain at least one document|Each imported document must be a JSON object|Invalid Item name/,
    );
  }
  assert.deepEqual(events, ["fetch", "fetch", "fetch", "fetch", "fetch", "validate"]);
  assert.equal(jsonCalls, 5);

  responseStatus = 404;
  requestedContent = { name: "valid-looking error payload" };
  await assert.rejects(data.DataLoader.loadData("item"), /HTTP 404/);
  assert.deepEqual(events, ["fetch", "fetch", "fetch", "fetch", "fetch", "validate", "fetch"]);
  assert.equal(jsonCalls, 5);
  assert.equal(pack.locked, true);
}));

test("data loader aborts on clear failure and restores a getter-only locked pack", async () => withDataLoaderRuntime(async () => {
  const events = [];
  let createCalls = 0;
  class TestItem extends globalThis.Item {
    validate() {
      return true;
    }
    static async createDocuments() {
      createCalls++;
    }
  }
  globalThis.Item = TestItem;
  globalThis.System = config.System;
  const pack = createCompendiumPack({
    collection: "aria.item",
    documentName: "Item",
    locked: true,
    documents: [{
      delete: async () => {
        events.push("delete:failed");
        throw new Error("deletion denied");
      },
    }],
    events,
  });
  game.packs.find = predicate => predicate(pack) ? pack : undefined;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ name: "Valid item" }) });

  await assert.rejects(data.DataLoader.loadData("item"), error => error.cause?.message === "deletion denied");
  assert.equal(pack.locked, true);
  assert.equal(createCalls, 0);
  assert.deepEqual(events, [
    "configure:false",
    "getDocuments",
    "delete:failed",
    "configure:true",
  ]);
  assert.ok(runtime.mockCalls.some(([action, message]) => action === "notification"
    && message.includes('Failed to clear compendium pack "aria.item"')));
}));

test("data loader restores the exact lock state when document creation fails", async () => withDataLoaderRuntime(async () => {
  const events = [];
  class TestItem extends globalThis.Item {
    validate() {
      return true;
    }
    static async createDocuments() {
      events.push("create");
      throw new Error("pack creation failed");
    }
  }
  globalThis.Item = TestItem;
  globalThis.System = config.System;
  const pack = createCompendiumPack({
    collection: "aria.item",
    documentName: "Item",
    locked: true,
    events,
  });
  game.packs.find = predicate => predicate(pack) ? pack : undefined;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ name: "Valid item" }) });

  await assert.rejects(data.DataLoader.loadData("item"), /pack creation failed/);
  assert.equal(pack.locked, true);
  assert.deepEqual(events, ["configure:false", "getDocuments", "create", "configure:true"]);
}));

test("data loader reports lock-restoration failures with or without an earlier import error", async () => {
  for (const failCreation of [false, true]) {
    await withDataLoaderRuntime(async () => {
      const events = [];
      let lockState = true;
      class TestItem extends globalThis.Item {
        validate() {
          return true;
        }
        static async createDocuments() {
          events.push("create");
          if (failCreation) {
            throw new Error("pack creation failed");
          }
        }
      }
      globalThis.Item = TestItem;
      globalThis.System = config.System;
      const pack = {
        collection: "aria.item",
        documentName: "Item",
        get locked() {
          return lockState;
        },
        configure: async ({ locked }) => {
          events.push(`configure:${locked}`);
          if (locked) {
            throw new Error("lock restoration failed");
          }
          lockState = locked;
        },
        getDocuments: async () => {
          events.push("getDocuments");
          return [];
        },
      };
      game.packs.find = predicate => predicate(pack) ? pack : undefined;
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ name: "Valid item" }) });

      await assert.rejects(data.DataLoader.loadData("item"), error => {
        if (failCreation) {
          return error instanceof AggregateError
            && error.errors[0].message === "pack creation failed"
            && error.errors[1].message === "lock restoration failed";
        }
        return error.message === "lock restoration failed";
      });
      assert.equal(pack.locked, false);
      assert.deepEqual(events, [
        "configure:false",
        "getDocuments",
        "create",
        "configure:true",
      ]);
      assert.ok(runtime.mockCalls.some(([action, message]) => action === "notification"
        && message.includes("Unable to restore the lock state for compendium")));
    });
  }
});

test("actor creation supplies configured competencies only for characters without items", async () => {
  game.aria.config.competences = [{ name: "Skill" }];
  const created = [];
  Actor.create = async (data, options) => {
    created.push({ data: structuredClone(data), options });
    return "created";
  };
  const character = { type: "character" };
  assert.equal(await actorModule.AriaActor.create(character, { temporary: true }), "created");
  assert.deepEqual(character.items, [{ name: "Skill" }]);
  const other = { type: "npc", items: [{ name: "existing" }] };
  await actorModule.AriaActor.create(other);
  assert.deepEqual(other.items, [{ name: "existing" }]);
  await actorModule.AriaActor.create({ type: "npc" });
  assert.deepEqual(created[2].data.items, []);
});

test("actor preparation delegates to Foundry and avoids token changes after rejected pre-creation", async () => {
  const actor = Object.assign(new actorModule.AriaActor(), {
    type: "npc",
    updateSource(data) { this.prototype = data.prototypeToken; },
  });
  await actor.fixPrototypeToken();
  assert.deepEqual(actor.prototype, {});
  actor.prepareBaseData();
  actor.prepareData();
  actor.prepareDerivedData();
  const originalPreCreate = Actor.prototype._preCreate;
  Actor.prototype._preCreate = async () => false;
  try {
    assert.equal(await actor._preCreate({}, {}, {}), false);
    assert.deepEqual(actor.prototype, {});
  } finally {
    Actor.prototype._preCreate = originalPreCreate;
  }
});

test("actor token, HP, profession, origin, and card ownership helpers retain expected values", async () => {
  const actor = Object.assign(new actorModule.AriaActor(), {
    type: "character",
    id: "actor-1",
    name: "Ari",
    system: { attributes: { hp: { max: 12, bonus: 0, value: 12 } } },
    ownership: { default: 1, player: 3, observer: 2 },
    updateSource(data) { this.updatedSource = data; },
    update: async data => data,
  });
  await actor.fixPrototypeToken();
  assert.deepEqual(actor.updatedSource.prototypeToken, {
    sight: { enabled: true }, actorLink: true, disposition: 1,
  });
  assert.equal(await actor._preCreate({}, {}, {}), undefined);
  await actor.modifyTokenAttribute("attributes.hp", 7);
  assert.deepEqual(actor.system.attributes.hp, { max: 12, bonus: 5, value: 7 });
  await actor.modifyTokenAttribute("other", 3);
  await actor.modifyActorBlessureAttribute(4);
  assert.deepEqual(actor.system.attributes.hp, { max: 12, bonus: 4, value: 8 });
  assert.equal(actor.getProfession([{ type: "profession" }]).type, "profession");
  assert.equal(actor.getOrigines([{ type: "origine" }]).type, "origine");
  assert.deepEqual(actor.getCardOwnership(), { player: 3, default: 0 });
  const settings = { deckSetting: {
    handsByActorID: { "actor-1": "hand" },
    decksByActorID: { "actor-1": "deck" },
    discardsByActorID: { "actor-1": "discard" },
  } };
  game.settings.get = (namespace, key) => settings[key];
  game.cards.get = id => ({ id });
  assert.equal(actor.getDefaultHand().id, "hand");
  assert.equal(actor.getDefaultDeck().id, "deck");
  assert.equal(actor.getDefaultDiscard().id, "discard");
  actor.id = "missing";
  assert.equal(actor.getDefaultHand(), false);
  assert.equal(actor.getDefaultDeck(), false);
  assert.equal(actor.getDefaultDiscard(), false);
});

test("actor default cards create and register a deck, hand, and discard", async () => {
  const actor = Object.assign(new actorModule.AriaActor(), {
    id: "card-actor",
    name: "Ari",
    ownership: { player: 3 },
    getCardOwnership: () => ({ player: 3 }),
  });
  const stored = { decksByActorID: {}, actorsByDeckID: {}, handsByActorID: {}, actorsByHandsID: {}, discardsByActorID: {}, actorsByDiscardsID: {} };
  game.settings.get = () => stored;
  game.settings.set = async (_ns, _key, value) => Object.assign(stored, value);
  game.packs.get = () => ({ getDocuments: async () => [{ toObject: () => ({ name: "Magic Deck" }) }] });
  const made = [];
  globalThis.Cards = { create: async value => {
    const card = { id: `created-${made.length}`, source: value, shuffle() { this.shuffled = true; } };
    made.push(card);
    return card;
  } };
  const hand = await actor.createDefaultCards();
  assert.equal(hand.id, "created-1");
  assert.equal(made[0].shuffled, true);
  assert.equal(made[0].source.name, "Deck de Ari");
  assert.equal(made[1].source.name, "Main de Ari");
  assert.equal(made[2].source.name, "Défausse de Ari");
  assert.deepEqual(stored.decksByActorID, { "card-actor": "created-0" });
  assert.deepEqual(stored.handsByActorID, { "card-actor": "created-1" });
  assert.deepEqual(stored.discardsByActorID, { "card-actor": "created-2" });
});

test("actor sheets select version-specific sizes and return enriched actor data", async () => {
  game.settings.get = () => "aria";
  assert.equal(characterSheetModule.AriaCharacterSheet.defaultHeight(), 920);
  assert.equal(lootSheetModule.AriaLootSheet.defaultHeight(), 770);
  game.settings.get = () => "stars";
  assert.equal(characterSheetModule.AriaCharacterSheet.defaultHeight(), 850);
  assert.equal(lootSheetModule.AriaLootSheet.defaultHeight(), 730);
  game.settings.get = () => "contemporain";
  assert.equal(characterSheetModule.AriaCharacterSheet.defaultHeight(), 780);
  assert.equal(lootSheetModule.AriaLootSheet.defaultHeight(), 730);
  game.settings.get = () => "aria";
  const actor = {
    isOwner: true, limited: false, system: { description: "bio" },
    items: collection([item("item", "Rope"), item("item", "Lantern"), item("item", "Dice")]),
    toObject: () => ({
      system: { description: "bio" },
      items: [
        { _id: "item-Rope", sort: 2 },
        { _id: "item-Lantern", sort: 1 },
        { _id: "item-Dice", sort: 0 },
      ],
    }),
  };
  actor.items.get = () => ({ labels: ["tool"] });
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), {
    actor, options: { editable: true }, isEditable: true,
  });
  const view = await sheet.getData();
  assert.equal(view.owner, true);
  assert.equal(view.biographyHTML, "enriched:bio");
  assert.deepEqual(view.items.map(value => value._id), ["item-Dice", "item-Lantern", "item-Rope"]);
  assert.deepEqual(view.items.map(value => value.labels), [["tool"], ["tool"], ["tool"]]);
  actor.toObject = () => ({
    system: { description: "bio" },
    items: [
      { _id: "item-Dice", sort: 0 },
      { _id: "item-Lantern", sort: 1 },
      { _id: "item-Rope", sort: 2 },
    ],
  });
  const alreadySortedView = await sheet.getData();
  assert.deepEqual(alreadySortedView.items.map(value => value._id), ["item-Dice", "item-Lantern", "item-Rope"]);
});

test("sheet defaults and actor-sheet utility callbacks preserve Foundry options", async () => {
  game.settings.get = () => "aria";
  assert.equal(characterSheetModule.AriaCharacterSheet.defaultOptions.width, 910);
  assert.equal(lootSheetModule.AriaLootSheet.defaultOptions.height, 770);
  assert.equal(itemSheetModule.AriaItemSheet.defaultOptions.width, 600);
  assert.equal(playerHandModule.AriaPlayerHand.DEFAULT_OPTIONS.position.height, 350);
  assert.equal(playerHandModule.AriaPlayerHand.PARTS.cards.template, "systems/aria/templates/cards/ariaPlayerHand_evantail.hbs");
  assert.equal(cardMenuModule.default.defaultOptions.submitOnChange, true);

  const opened = [];
  const ownedItem = { sheet: { render: value => opened.push(["render", value]) } };
  const actor = {
    items: collection([]),
    getDefaultHand: () => false,
    createDefaultCards: async () => opened.push(["create-cards"]),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), {
    actor,
    object: {
      getDefaultHand: () => false,
      createDefaultCards: async () => opened.push(["create-default"]),
    },
    element: { find: () => ({ css: (key, value) => opened.push([key, value]) }) },
  });
  actor.items.get = () => ownedItem;
  const originalDollar = globalThis.$;
  globalThis.$ = target => ({
    parents: () => ({ data: key => target.dataset[key] }),
  });
  try {
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "item" } } });
  } finally {
    globalThis.$ = originalDollar;
  }
  assert.deepEqual(opened[0], ["render", true]);
  const position = sheet.setPosition({ height: 500 });
  assert.equal(position.height, 500);
  assert.deepEqual(opened.at(-1), ["height", 308]);
  await sheet.onOpenMagicCards();
  assert.ok(opened.some(([action]) => action === "create-default"));
  const optionsPromise = sheet.getRollOptions("roll.hbs", "Roll", { showBonus: true });
  await new Promise(resolve => setImmediate(resolve));
  const dialogCall = runtime.mockCalls.filter(([action]) => action === "dialog").at(-1);
  dialogCall[1].buttons.normal.callback([{ querySelector: () => ({}) }]);
  assert.deepEqual(await optionsPromise, { multi: 2, bonusMalus: "0" });
  const cancelledOptions = sheet.getRollOptions("roll.hbs", "Roll");
  await new Promise(resolve => setImmediate(resolve));
  const cancelDialog = runtime.mockCalls.filter(([action]) => action === "dialog").at(-1)[1];
  cancelDialog.buttons.cancel.callback();
  assert.deepEqual(await cancelledOptions, { cancelled: true });
  const closedOptions = sheet.getRollOptions("roll.hbs", "Roll");
  await new Promise(resolve => setImmediate(resolve));
  const closeDialog = runtime.mockCalls.filter(([action]) => action === "dialog").at(-1)[1];
  closeDialog.close();
  assert.deepEqual(await closedOptions, { cancelled: true });
});

test("editable actor sheet wires control actions to item and sheet operations", async () => {
  const registered = new Map();
  const actorUpdates = [];
  const actorCreates = [];
  const sheetEvents = [];
  const entity = item("item", "Potion", {
    equiped: false,
    qty: 1,
    properties: { stackable: true },
    score: 1,
    bonus: "+0",
  });
  const actor = {
    items: collection([entity]),
    updateEmbeddedDocuments: async (...args) => actorUpdates.push(args),
    createEmbeddedDocuments: (...args) => actorCreates.push(args),
    modifyActorBlessureAttribute: value => sheetEvents.push(["hp", value]),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), {
    actor,
    options: { editable: true },
    _onRoll: (...args) => sheetEvents.push(["roll", ...args]),
    _onEditItem: (...args) => sheetEvents.push(["edit", ...args]),
    _onCalcComp: (...args) => sheetEvents.push(["calculate", ...args]),
    _onDeleteItem: (...args) => sheetEvents.push(["delete", ...args]),
    onOpenMagicCards: (...args) => sheetEvents.push(["magic", ...args]),
  });
  const pack = { render: value => sheetEvents.push(["pack", value]) };
  game.packs.get = () => pack;
  const originalDollar = globalThis.$;
  globalThis.$ = target => ({
    0: target,
    data: key => target.dataset?.[key],
    parents: () => ({ data: key => target.dataset?.[key] }),
    closest: () => ({
      data: key => target.dataset?.[key],
      find: () => ({ slideToggle: value => sheetEvents.push(["toggle", value]) }),
    }),
  });
  const html = {
    find(selector) {
      const handlers = registered.get(selector) ?? {};
      registered.set(selector, handlers);
      return {
        click: handler => { handlers.click = handler; },
        contextmenu: handler => { handlers.contextmenu = handler; },
        change: handler => { handlers.change = handler; },
      };
    },
  };
  try {
    sheet.options.editable = false;
    sheet.activateListeners(html);
    assert.equal(registered.size, 0);
    sheet.options.editable = true;
    sheet.activateListeners(html);
    const event = value => ({
      preventDefault() {},
      currentTarget: { dataset: { itemId: entity.id, pack: "aria.test" }, value },
      shiftKey: false,
    });
    registered.get(".aria-compendium-pack").click(event());
    registered.get(".item-create.new-capa").click(event());
    registered.get(".item-create.new-capa-spe").click(event());
    registered.get(".item-create.new-item").click(event());
    registered.get(".rollable").click(event());
    registered.get(".rollable").contextmenu(event());
    registered.get(".competence-create").click(event());
    registered.get(".competence-toggle").click(event());
    registered.get(".item-equip").click(event());
    registered.get(".item-qty").click(event());
    registered.get(".item-qty").contextmenu(event());
    await registered.get(".capa_score").change(event("120"));
    entity.system.qty = 0;
    registered.get(".item-qty").click(event());
    registered.get(".item-qty").contextmenu(event());
    entity.system.score = 0;
    await registered.get(".capa_score").change(event("0"));
    entity.system.score = 20;
    await registered.get(".capa_score").change(event("20"));
    registered.get(".capa_bonus").change(event("4"));
    registered.get(".capa_bonus").change(event("-2"));
    registered.get(".capa_bonus").change(event("+3"));
    registered.get(".hp_blessure").change(event("3"));
    registered.get(".item-edit").click(event());
    registered.get(".calc-comp").click(event());
    registered.get(".item-delete").click(event());
    registered.get(".carte_magie").click(event());
  } finally {
    globalThis.$ = originalDollar;
  }
  assert.equal(registered.size, 17);
  assert.equal(actorUpdates[0][1][0].system.equiped, true);
  assert.equal(actorUpdates[1][1][0].system.qty, 2);
  assert.equal(actorUpdates[2][1][0].system.qty, 0);
  assert.equal(actorUpdates[3][1][0].system.score, 100);
  assert.equal(actorUpdates[4][1][0].system.qty, 1);
  assert.equal(actorUpdates[5][1][0].system.qty, 0);
  assert.equal(actorUpdates[6][1][0].system.score, 0);
  assert.equal(actorUpdates[7][1][0].system.score, "20");
  assert.equal(actorUpdates[8][1][0].system.bonus, "+4");
  assert.equal(actorUpdates[9][1][0].system.bonus, "-2");
  assert.equal(actorUpdates[10][1][0].system.bonus, "+3");
  assert.equal(actorCreates.length, 4);
  assert.equal(actorCreates[1][1][0].data.special, true);
  assert.ok(sheetEvents.some(([name]) => name === "toggle"));
  assert.ok(sheetEvents.some(([name]) => name === "hp"));
});

test("actor sheets route edits, deletes, and competency calculations through actor APIs", async () => {
  const updates = [];
  const competence = item("competence", "Test", { special: false, link1: "ARIA.stats.str.abbrev", link2: "ARIA.stats.dex.abbrev", score: 0 });
  const items = collection([competence]);
  const actor = {
    items,
    system: { stats: { str: { base: 20 }, dex: { base: 30 }, end: { base: 0 }, int: { base: 0 }, cha: { base: 0 }, intu: { base: 0 } } },
    updateEmbeddedDocuments: async (...args) => updates.push(args),
    deleteEmbeddedDocuments: async (...args) => updates.push(["delete", ...args]),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  await sheet._updateCompValue();
  assert.equal(updates[0][1][0].system.score, 100);
  const competenceDeleteEvent = {
    preventDefault() {},
    currentTarget: { dataset: { itemId: competence.id } },
  };
  globalThis.$ = target => ({ parents: () => ({ data: key => target.dataset[key] }) });
  await sheet._onDeleteItem(competenceDeleteEvent);
  assert.deepEqual(updates[1], ["delete", "Item", [competence.id]]);
  const current = { preventDefault() {}, currentTarget: { dataset: { itemId: competence.id } } };
  sheet._onDeleteItem(current);
  assert.deepEqual(updates[2], ["delete", "Item", [competence.id]]);
});

test("actor sheet edits world items and dispatches type-specific deletion behavior", async () => {
  const opened = [];
  const deleted = [];
  const entity = { sheet: { render: value => opened.push(value) } };
  const actorItems = collection([
    item("profession", "Profession"),
    item("origine", "Origine"),
    item("item", "Other"),
  ]);
  const actor = {
    items: actorItems,
    deleteEmbeddedDocuments: (...args) => deleted.push(args),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  const oldGet = actorItems.get;
  actorItems.get = () => undefined;
  game.items.get = id => id === "world" ? entity : undefined;
  game.packs.get = () => ({ getDocument: async () => entity });
  const oldDollar = globalThis.$;
  globalThis.$ = target => ({
    parents: () => ({ data: key => target.dataset[key] }),
  });
  try {
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "world", itemType: "competence", pack: "aria.competences" } } });
    assert.deepEqual(opened, [true]);
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "missing" } } });
    const eventFor = id => ({ preventDefault() {}, currentTarget: { dataset: { itemId: id } } });
    await sheet._onDeleteItem(eventFor("profession-Profession"));
    await sheet._onDeleteItem(eventFor("origine-Origine"));
    sheet._onDeleteItem(eventFor("item-Other"));
  } finally {
    globalThis.$ = oldDollar;
    actorItems.get = oldGet;
  }
  assert.equal(runtime.mockCalls.filter(([action]) => action === "confirm").length >= 2, true);
  assert.deepEqual(deleted, [["Item", ["item-Other"]]]);
});

test("competency calculation dialog updates normal scores and leaves special skills alone", () => {
  const updated = [];
  const stats = ["str", "dex", "end", "int", "cha", "intu"];
  const competencies = stats.flatMap((stat, index) => [
    item("competence", `Skill ${index}`, {
      special: false,
      link1: `ARIA.stats.${stat}.abbrev`,
      link2: "",
      score: 0,
    }),
    item("competence", `Linked skill ${index}`, {
      special: false,
      link1: "",
      link2: `ARIA.stats.${stat}.abbrev`,
      score: 0,
    }),
  ]);
  competencies.push(item("competence", "Unknown", {
    special: false,
    link1: "ARIA.stats.unknown.abbrev",
    link2: "",
    score: 0,
  }));
  competencies.push(item("competence", "Special", { special: true, link1: "", link2: "", score: 90 }));
  const actor = {
    items: collection(competencies),
    system: { stats: Object.fromEntries(["str", "dex", "end", "int", "cha", "intu"].map(key => [key, { base: 20 }])) },
    updateEmbeddedDocuments: (_type, records) => updated.push(records[0]),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  sheet._onCalcComp({ preventDefault() {} });
  const dialog = runtime.mockCalls.filter(([action]) => action === "dialog").at(-1)[1];
  dialog.buttons.one.callback();
  assert.equal(updated.length, 13);
  assert.ok(updated.slice(0, 12).every(skill => skill.system.score === 50));
  assert.equal(updated[12].system.score, 0);
  dialog.buttons.two.callback();
});

test("actor roll routing forwards options and cancels configured rolls", async () => {
  const originalMethods = {
    skillCheck: rollModule.AriaRoll.skillCheck,
    competencyCheck: rollModule.AriaRoll.competencyCheck,
    rollWeapon: rollModule.AriaRoll.rollWeapon,
    rollInitiative: rollModule.AriaRoll.rollInitiative,
  };
  const calls = [];
  for (const method of Object.keys(originalMethods)) {
    rollModule.AriaRoll[method] = (...args) => calls.push([method, ...args.slice(2)]);
  }
  const actor = { id: "actor" };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), {
    actor,
    getData: () => ({ system: { stat: 1 }, items: ["competence"] }),
    getRollOptions: async (_path, _title, options) => ({ ...options, multi: 3, bonusMalus: "0", cancelled: false }),
  });
  const event = rollType => ({ currentTarget: mockElement({ "data-roll-type": rollType }), shiftKey: true });
  try {
    runtime.settings.set("aria.carac100", true);
    await sheet._onRoll(event("skillcheck"), false);
    assert.equal(calls.at(-1)[0], "skillCheck");
    assert.equal(calls.at(-1)[2], 1);
    assert.equal(calls.at(-1)[3], "BLIND");
    await sheet._onRoll(event("skillcheck"), true);
    assert.equal(calls.at(-1)[2], 1);
    const beforeConfiguredCancel = calls.length;
    sheet.getRollOptions = async () => ({ cancelled: true });
    await sheet._onRoll(event("skillcheck"), true);
    assert.equal(calls.length, beforeConfiguredCancel);
    sheet.getRollOptions = async (_path, _title, options) => ({ ...options, multi: 3, bonusMalus: "0", cancelled: false });
    runtime.settings.set("aria.carac100", false);
    await sheet._onRoll(event("skillcheck"), false);
    assert.equal(calls.at(-1)[4], "+0");
    sheet.getRollOptions = async (_path, _title, options) => ({ ...options, multi: 4, bonusMalus: "0", rollType: "BLIND" });
    await sheet._onRoll(event("skillcheck"), true);
    assert.equal(calls.at(-1)[2], 4);
    assert.equal(calls.at(-1)[4], "+0");
    await sheet._onRoll(event("competencycheck"), true);
    assert.equal(calls.at(-1)[0], "competencyCheck");
    assert.equal(calls.at(-1)[2], "+0");
    const beforeCancelled = calls.length;
    sheet.getRollOptions = async () => ({ cancelled: true });
    await sheet._onRoll(event("skillcheck"), false);
    assert.equal(calls.length, beforeCancelled);
    await sheet._onRoll(event("competencycheck"), false);
    assert.equal(calls.at(-1)[0], "competencyCheck");
    const beforeConfigCancel = calls.length;
    await sheet._onRoll(event("competencycheck"), true);
    assert.equal(calls.length, beforeConfigCancel);
    await sheet._onRoll(event("weapon"), true);
    await sheet._onRoll(event("initiative"), true);
    assert.equal(calls.length, beforeConfigCancel);
    sheet.getRollOptions = async () => ({ rollType: "BLIND", bonusMalus: "+2" });
    await sheet._onRoll(event("weapon"), true);
    await sheet._onRoll(event("initiative"), true);
    assert.deepEqual(calls.slice(-2).map(([method]) => method), ["rollWeapon", "rollInitiative"]);
    const beforeUnknown = calls.length;
    await sheet._onRoll(event("unknown"), false);
    assert.equal(calls.length, beforeUnknown);
  } finally {
    Object.assign(rollModule.AriaRoll, originalMethods);
  }
});

test("characteristic rolls await actor sheet data before passing the system context", async () => {
  const originalSkillCheck = rollModule.AriaRoll.skillCheck;
  let providedActorData = "not-called";
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), {
    actor: {
      id: "actor",
      isOwner: true,
      limited: false,
      items: collection([]),
      toObject: () => ({ system: { description: "" }, items: [] }),
    },
  });
  runtime.settings.set("aria.carac100", true);
  rollModule.AriaRoll.skillCheck = value => { providedActorData = value; };
  try {
    await sheet._onRoll({ currentTarget: mockElement({ "data-roll-type": "skillcheck" }), shiftKey: false }, false);
    assert.deepEqual(providedActorData, { description: "" });
  } finally {
    rollModule.AriaRoll.skillCheck = originalSkillCheck;
  }
});

test("actor sheet drop parsing rejects malformed data and applies owned item drops", async () => {
  const created = [];
  const actor = {
    id: "target",
    _id: "target",
    isOwner: true,
    items: collection([]),
    createEmbeddedDocuments: (...args) => created.push(args),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  const event = text => ({
    shiftKey: false,
    preventDefault() {},
    dataTransfer: { getData: () => text },
  });
  assert.equal(await sheet._onDrop(event("{bad"), ), false);
  assert.equal(await sheet._onDrop(event("null")), false);
  assert.equal(await sheet._onDropActor(event("{}"), {}), false);
  assert.equal(await sheet._onDrop(event('{"type":"Actor"}')), false);
  actor.isOwner = false;
  assert.equal(await sheet._onDropItem(event("{}"), { uuid: "Item.x" }), false);
  assert.equal(await sheet._onDrop(event('{"type":"Item"}')), false);
  actor.isOwner = true;
  Item.fromDropData = async () => ({
    toObject: () => ({ type: "profession", system: { competences: [{ type: "competence" }] } }),
  });
  await sheet._onDropItem(event("{}"), { type: "Item", uuid: "Item.profession" });
  assert.equal(created[0][1].length, 2);
});

test("actor sheet rejects transfer when the receiving actor has no document id", async () => {
  const created = [];
  const actor = {
    id: "target",
    isOwner: true,
    items: collection([]),
    createEmbeddedDocuments: (...args) => created.push(args),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  const originalFromUuid = globalThis.fromUuid;
  const originalFromDropData = Item.fromDropData;
  const originalWarn = console.warn;
  const warnings = [];
  Item.fromDropData = async () => ({
    id: "item-1",
    toObject: () => ({ type: "item", name: "Herb", system: { qty: 1, properties: {} } }),
  });
  globalThis.fromUuid = async () => ({ actor: { id: "source" } });
  runtime.settings.set("aria.moveItem", "1");
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(await sheet._onDropItem({ shiftKey: false }, { uuid: "Item.one" }), false);
    globalThis.fromUuid = async () => ({ actor: {} });
    await sheet._onDropItem({ shiftKey: false }, { uuid: "Item.idless-source" });
  } finally {
    globalThis.fromUuid = originalFromUuid;
    Item.fromDropData = originalFromDropData;
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /without an id/);
  assert.equal(created.length, 1);
});

test("actor sheet magic-card action creates missing cards and opens an available hand", async () => {
  const rendered = [];
  let hand;
  const object = {
    getDefaultHand: () => hand,
    createDefaultCards: async () => {
      hand = { sheet: { render: value => rendered.push(value) } };
    },
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { object });
  await sheet.onOpenMagicCards({ preventDefault() {} });
  assert.deepEqual(rendered, [true]);
  object.getDefaultHand = () => null;
  await sheet.onOpenMagicCards({ preventDefault() {} });
  assert.deepEqual(rendered, [true]);
});

test("actor item drops sort, copy, or confirm transfers based on origin and settings", async () => {
  const created = [];
  const removed = [];
  const actor = {
    id: "target",
    _id: "target",
    isOwner: true,
    items: collection([]),
    createEmbeddedDocuments: (...args) => created.push(args),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  const event = { preventDefault() {}, shiftKey: false };
  Item.fromDropData = async () => ({
    id: "item-1",
    toObject: () => ({ type: "item", name: "Herb", system: { qty: 1, properties: {} } }),
  });
  globalThis.fromUuid = async () => ({ actor: null });
  await sheet._onDropItem(event, { uuid: "Item.one" });
  assert.equal(created.length, 1);

  runtime.settings.set("aria.moveItem", "0");
  globalThis.fromUuid = async () => ({ actor: { id: "source" } });
  await sheet._onDropItem(event, { uuid: "Item.two" });
  assert.equal(created.length, 2);

  const sorted = [];
  sheet._onSortItem = (_event, itemData) => sorted.push(itemData.name);
  globalThis.fromUuid = async () => ({ actor: { id: "target" } });
  await sheet._onDropItem(event, { uuid: "Item.same" });
  assert.deepEqual(sorted, ["Herb"]);

  runtime.settings.set("aria.moveItem", "1");
  globalThis.fromUuid = async () => ({
    actor: { id: "source", deleteEmbeddedDocuments: (...args) => removed.push(args) },
  });
  await sheet._onDropItem(event, { uuid: "Item.transfer" });
  const transferDialog = runtime.mockCalls.filter(([action]) => action === "dialog").at(-1)[1];
  transferDialog.buttons.two.callback();
  assert.equal(created.length, 2);
  transferDialog.buttons.one.callback();
  assert.equal(created.length, 3);
  assert.deepEqual(removed, [["Item", ["item-1"]]]);

  Item.fromDropData = async () => ({
    toObject: () => ({ type: "origine", system: { competences: [] } }),
  });
  await sheet._onDropItem(event, { uuid: "Item.origin" });
  assert.equal(created.length, 4);
});

test("actor inventory drops create new records or increment matching stackable items", async () => {
  const created = [];
  const updates = [];
  const inventoryItem = {
    type: "item",
    name: "Herb",
    system: { properties: { stackable: true }, qty: 2 },
    update: async value => updates.push(value),
  };
  const actor = {
    items: collection([inventoryItem]),
    createEmbeddedDocuments: (...args) => created.push(args),
  };
  const sheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor });
  await sheet._addItemToInventory({ type: "item", name: "Herb", system: { qty: 3 } });
  assert.deepEqual(updates, [{ "system.qty": 5 }]);
  await sheet._addItemToInventory({ type: "item", name: "Rope", system: { qty: 1 } });
  assert.equal(created[0][1][0].name, "Rope");
});

test("items prepare armor totals, weapon defaults, and slug keys", () => {
  const armor = Object.assign(new itemModule.AriaItem(), {
    type: "item", name: "Iron", system: { defBase: "2", defBonus: "3", skillBonus: null, dmgBonus: 0 },
  });
  armor.prepareData();
  assert.equal(armor.system.def, 5);
  assert.equal(armor.system.skillBonus, 0);
  assert.equal(armor.system.dmgBonus, 0);
  const shield = Object.assign(new itemModule.AriaItem(), {
    system: { defBase: "1", defBonus: "2", skillBonus: 1, dmgBonus: 2 },
  });
  shield._prepareShieldData(shield, null);
  assert.deepEqual(shield.system, {
    defBase: "1", defBonus: "2", skillBonus: 1, dmgBonus: 2, def: 3,
  });
  const skill = Object.assign(new itemModule.AriaItem(), {
    type: "competence", name: "Iron Skill", system: {},
  });
  skill.prepareData();
  assert.equal(skill.system.key, "iron-skill");
  const ownedArmor = Object.assign(new itemModule.AriaItem(), {
    type: "item", name: "Owned Armor", actor: { id: "owner" },
    system: { defBase: "3", defBonus: "1" },
  });
  ownedArmor.prepareData();
  assert.equal(ownedArmor.system.def, 4);
  const createdItems = [];
  const owner = { createEmbeddedDocuments: (...args) => createdItems.push(args) };
  itemModule.AriaItem.createForActor(owner);
  assert.equal(createdItems[0][1][0].name, "Nom de l'objet");
  assert.equal(createdItems[0][2].renderSheet, true);
});

test("global item sheets expose item properties and add competence references once", async () => {
  game.aria.config = config.ARIA;
  const baseItem = {
    type: "profession",
    system: { description: "Profession", competences: [{ _id: "existing" }] },
    labels: ["label"],
    toObject: () => ({ type: "profession", system: { description: "Profession", competences: [{ _id: "existing" }] } }),
    update: async data => data,
  };
  const sheet = Object.assign(new globalItemSheetModule.GlobalAriaItemSheet(), { item: baseItem, options: { editable: true } });
  const added = item("competence", "New", {}, { _id: "new-id" });
  const event = { preventDefault() {} };
  const update = await sheet._onDropCompetenceItem(event, added);
  assert.equal(update.system.competences.length, 2);
  const duplicate = await sheet._onDropCompetenceItem(event, { _id: "existing" });
  assert.equal(duplicate, undefined);
  assert.equal(runtime.mockCalls.at(-1)[1], "Cette compétence existe déja.");
  baseItem.system.competences = null;
  assert.equal(await sheet._onDropCompetenceItem(event, added), undefined);
  assert.equal(runtime.mockCalls.at(-1)[1], "Ajout de cette compétence impossible.");
  assert.deepEqual(sheet._getItemProperties({
    type: "item",
    system: { properties: { weapon: true, ranged: false, unknown: true } },
  }), [config.ARIA.itemProperties.weapon]);
  assert.deepEqual(sheet._getItemProperties({ type: "competence", system: { properties: {} } }), []);
});

test("global item sheet handles permissions, item drops, and rendered item data", async () => {
  const updates = [];
  const document = {
    type: "profession",
    name: "Profession",
    system: { description: "Description", properties: {}, competences: [] },
    labels: ["label"],
    toObject: () => ({ type: "profession", name: "Profession", system: { description: "Description", properties: {}, competences: [] } }),
    update: async value => { updates.push(value); return value; },
  };
  const sheet = Object.assign(new globalItemSheetModule.GlobalAriaItemSheet(), {
    item: document,
    options: { editable: true },
    element: { find: () => ({ css: () => {} }) },
  });
  const entry = item("competence", "Observation", {}, { _id: "comp-1" });
  Item.fromDropData = async () => ({ toObject: () => ({ ...entry.toObject(), _id: "comp-1" }) });
  await sheet._onDropItem({ preventDefault() {} }, {});
  assert.equal(updates[0].system.competences[0]._id, "comp-1");
  Item.fromDropData = async () => ({ toObject: () => ({ type: "item" }) });
  await sheet._onDropItem({ preventDefault() {} }, {});
  assert.equal(runtime.mockCalls.at(-1)[1], "Seules les compétences peuvent être ajoutées.");
  const positioned = sheet.setPosition({ width: 500 });
  assert.equal(positioned.height, 400);
  assert.deepEqual(sheet._getItemProperties({ type: "item", system: { properties: {} } }), []);

  const previousGetData = ItemSheet.prototype.getData;
  ItemSheet.prototype.getData = function () {
    return { item: this.item.toObject(false) };
  };
  try {
    CONFIG.ARIA = config.ARIA;
    game.aria.config = config.ARIA;
    const data = await sheet.getData();
    assert.equal(data.itemType, "ITEM.TypeProfession");
    assert.equal(data.descriptionHTML, "enriched:Description");
    assert.equal(data.labels[0], "label");
  } finally {
    ItemSheet.prototype.getData = previousGetData;
  }
});

test("global item sheets wire drag behavior and validate common drops", async () => {
  const calls = [];
  const registered = [];
  const html = {
    find(selector) {
      return {
        on: (eventName, callback) => registered.push([selector, eventName, callback]),
        click: callback => registered.push([selector, "click", callback]),
      };
    },
  };
  const sheet = Object.assign(new globalItemSheetModule.GlobalAriaItemSheet(), {
    options: { editable: false },
    _onDropItem: async (_event, data) => calls.push(["item", data]),
    element: { find: () => ({ css: () => {} }) },
  });
  sheet.activateListeners(html);
  assert.equal(registered.length, 6);
  const dragState = [];
  const dropTarget = {
    classList: {
      add: name => dragState.push(["add", name]),
      remove: name => dragState.push(["remove", name]),
    },
  };
  for (const [selector, eventName, callback] of registered.filter(([selector]) => selector === ".droppable")) {
    callback({
      currentTarget: dropTarget,
      preventDefault() { dragState.push(["prevent", eventName]); },
      stopPropagation() { dragState.push(["stop", eventName]); },
    });
  }
  assert.deepEqual(dragState.filter(([action]) => action === "add" || action === "remove").map(([, name]) => name), [
    "dragging", "dragging", "dragging",
  ]);
  let prevented = 0;
  const eventWith = text => ({
    preventDefault: () => prevented++,
    dataTransfer: { getData: () => text },
  });
  assert.equal(await sheet._onDrop(eventWith("{}")), false);
  sheet.options.editable = true;
  assert.equal(await sheet._onDrop(eventWith("bad json")), false);
  assert.equal(await sheet._onDrop(eventWith("null")), false);
  assert.equal(await sheet._onDrop(eventWith('{"type":"Item","id":"dropped"}')), 1);
  assert.equal(await sheet._onDrop(eventWith('{"type":"Actor"}')), false);
  assert.deepEqual(calls[0], ["item", { type: "Item", id: "dropped" }]);
  assert.equal(prevented, 5);
});

test("global item links open matching compendium entries and remove referenced competencies", async () => {
  const rendered = [];
  const entity = { sheet: { render: value => rendered.push(value) } };
  const lookups = [];
  game.packs.get = () => ({ getDocument: async id => {
    lookups.push(id);
    return id === "missing" ? undefined : entity;
  } });
  const competence = { _id: "cap-1" };
  const document = {
    toObject: () => ({ type: "profession", system: { competences: [competence] } }),
    system: { competences: [competence] },
    update: async data => data,
  };
  const sheet = Object.assign(new globalItemSheetModule.GlobalAriaItemSheet(), { item: document });
  const oldDollar = globalThis.$;
  globalThis.$ = target => ({
    closest: () => ({ data: key => target.dataset[key] }),
  });
  try {
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "cap-1", itemType: "competence" } } });
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "origin-1", itemType: "origine" } } });
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "profession-1", itemType: "profession" } } });
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "missing", itemType: "competence" } } });
    await sheet._onEditItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "world-1", itemType: "item" } } });
    const updated = await sheet._onDeleteItem({ preventDefault() {}, currentTarget: { dataset: { itemId: "cap-1", itemType: "competence" } } });
    assert.deepEqual(updated.system.competences, []);
  } finally {
    globalThis.$ = oldDollar;
  }
  assert.deepEqual(rendered, [true, true, true]);
  assert.deepEqual(lookups, ["cap-1", "origin-1", "profession-1", "missing"]);
});

test("card menu highlights duplicated decks and surfaces current assignment mappings", async () => {
  const magicalCharacter = {
    id: "mage-1",
    type: "character",
    items: collection([
      item("competence", "Saut", { special: false }),
      item("competence", "Modélisation", { special: true }),
    ]),
  };
  game.actors = collection([magicalCharacter, { type: "npc", items: [] }]);
  game.cards.contents = [{ id: "deck-1" }];
  game.user.isGM = true;
  const assignments = {
    decksByActorID: { "mage-1": "deck-1" },
    handsByActorID: { "mage-1": "hand-1" },
    discardsByActorID: { "mage-1": "discard-1" },
  };
  runtime.settings.set("aria.deckSetting", assignments);
  const menu = new cardMenuModule.default();
  const result = menu.getData();
  assert.equal(result.isGM, true);
  assert.equal(result.deckList[0].id, "deck-1");
  assert.deepEqual(result.decksByActorID.map(actor => actor.id), ["mage-1"]);
  assert.deepEqual(result.handsByActorID.map(actor => actor.id), ["mage-1"]);
  assert.deepEqual(result.discardsByActorID.map(actor => actor.id), ["mage-1"]);
  assert.deepEqual(result.object, assignments);

  const selections = ["same", "same", "unique"].map(value => ({
    options: [{ value }],
    selectedIndex: 0,
    classList: {
      classes: new Set(),
      add(name) { this.classes.add(name); },
      remove(name) { this.classes.delete(name); },
    },
  }));
  const submit = { disabled: false, innerText: "" };
  menu.element = {
    find(selector) {
      if (selector === "select") return selections;
      if (selector === 'button[type="submit"]') return [submit];
      if (selector === ".doubled") return { length: selections.filter(select => select.classList.classes.has("doubled")).length };
      return [];
    },
  };
  menu.checkDoubled();
  assert.equal(submit.disabled, true);
  assert.equal(submit.innerText, "Supprimer les doubles");
  assert.equal(selections[0].classList.classes.has("doubled"), true);
  selections[1].options[0].value = "other";
  selections[0].options[0].value = "first";
  menu.doubledValues = ["first"];
  menu.checkDoubled();
  assert.equal(submit.disabled, false);
  assert.equal(submit.innerText, "Enregistrer");
  assert.deepEqual(menu.doubledValues, []);
  const listeners = new Map();
  await menu.activateListeners({
    find(selector) {
      return { change: callback => listeners.set(selector, callback) };
    },
  });
  assert.equal(listeners.size, 3);
  menu._updateObject({ submitter: { name: "cancel" } }, {});
  menu._updateObject({ submitter: { name: "submit" } }, {});
  game.actors.get = id => ({ id });
  game.cards.get = id => ({ id });
  const selectEvent = prefix => ({
    currentTarget: {
      getAttribute: () => `${prefix}.mage`,
      options: [{ value: "card-1" }],
      selectedIndex: 0,
    },
  });
  menu.onChangeHand(null, selectEvent("handsByActorID"));
  menu.onChangeDeck(null, selectEvent("decksByActorID"));
  menu.onChangeDiscard(null, selectEvent("discardsByActorID"));
});

test("player hand declares the native V2 fan contract without a footer", async () => {
  const Hand = playerHandModule.AriaPlayerHand;
  const options = new Hand().options;
  const source = readFileSync(new URL("../templates/cards/ariaPlayerHand_evantail.hbs", import.meta.url), "utf8");

  assert.equal(Object.getPrototypeOf(Hand), foundry.applications.sheets.CardHandConfig);
  assert.equal(globalThis.CardHand, undefined);
  assert.deepEqual(options.position, { width: 400, height: 350 });
  assert.equal(options.window.resizable, false);
  assert.ok(options.classes.includes("cardsHand"));
  for (const action of ["drawCard", "play", "discard", "pass", "focusCard"]) {
    assert.equal(typeof options.actions[action], "function");
  }
  for (const action of ["draw", "controlCard", "reset", "shuffle", "toggleSort"]) {
    assert.equal(typeof options.actions[action], "function", `${action} remains inherited from Foundry`);
  }
  assert.deepEqual(Object.keys(Hand.PARTS), ["cards"]);
  assert.equal(Hand.PARTS.cards.root, true);
  assert.deepEqual(Hand.PARTS.cards.scrollable, ["ol[data-cards]"]);
  assert.match(source, /^\s*<div\b/);
  assert.doesNotMatch(source, /^\s*<form\b/);
  assert.match(source, /<ol[^>]*data-cards/);
  assert.match(source, /data-action="focusCard"/);
  assert.match(source, /data-card-id="\{\{card\.id\}\}"/);
  assert.match(source, /src="\{\{card\.img\}\}"/);
  assert.match(source, /data-action="play"/);
  assert.match(source, /data-action="discard"/);

  const { hand, document } = createHandFixture();
  await hand.submit({ operation: { render: false } });
  assert.equal(options.tag, "form");
  assert.deepEqual(hand.submissions, [{ operation: { render: false } }]);
  const context = await hand._preparePartContext("cards", { document }, {});
  assert.equal(context.document, document);
  assert.deepEqual(context.cards, []);
  assert.deepEqual(context.cardTypes, {});
  assert.ok(context.sortModeIcon);

  const area = { children: [{ style: {} }, { style: {} }], style: {} };
  hand.element = { querySelectorAll: selector => selector === ".cards" ? [area] : [] };
  await hand._onRender({}, { parts: ["cards"] });
  assert.equal(hand.applicationRenderCalls.length, 1);
  assert.equal(hand.nativeRenderCalls.length, 1);
  assert.equal(hand.nativeDragDropSelector, "ol[data-cards] > li");
  assert.equal(area.children[1].style.transform, "translateX(60px)");
  assert.equal(area.style.transform, "translateX(93px)");

  await hand.dispatchAction(handAction("draw").event);
  assert.deepEqual(document.nativeActions, [["draw-dialog"]]);
});

test("player hand routes delegated pass actions using the clicked card ID", async () => {
  const card = { id: "hand-card-1" };
  const { hand, document } = createHandFixture({ cards: [card] });
  const action = handAction("pass", card.id);

  await hand.dispatchAction(action.event);

  assert.deepEqual(document.nativeActions, [["play-dialog", card]]);
  assert.deepEqual(hand.submissions, [{ operation: { render: false } }]);
});

test("player hand keeps header pass as the whole-hand dialog", async () => {
  const { hand, document } = createHandFixture();
  const action = handAction("pass");

  await hand.dispatchAction(action.event);

  assert.deepEqual(document.nativeActions, [["pass-dialog"]]);
});

test("player hand focuses cards and preserves native lifecycle rendering", async () => {
  const focusedCard = { classList: { toggled: null, toggle(name) { this.toggled = name; } } };
  const { hand } = createHandFixture();
  const action = handAction("focusCard", "hand-card-1");
  action.row.classList = focusedCard.classList;
  await hand.dispatchAction(action.event);
  assert.equal(focusedCard.classList.toggled, "focusedCard");
  await hand.dispatchAction(handAction("focusCard").event);

  const calls = [];
  hand.render = force => calls.push(["render", force]);
  hand.close = () => calls.push(["close"]);
  hand.maximize = () => calls.push(["maximize"]);
  await hand.toggleRender();
  hand.rendered = true;
  hand.minimized = true;
  await hand.toggleRender();
  hand.minimized = false;
  await hand.toggleRender();
  assert.deepEqual(calls, [["render", true], ["maximize"], ["close"]]);

  const unrenderedHand = createHandFixture().hand;
  unrenderedHand.rotateCards();
  unrenderedHand.element = {};
  unrenderedHand.rotateCards();
  unrenderedHand.element = { querySelectorAll: () => undefined };
  unrenderedHand.rotateCards();
  unrenderedHand.element = { querySelectorAll: () => [] };
  unrenderedHand.rotateCards();
  const emptyCardArea = { children: [], style: {} };
  unrenderedHand.element = { querySelectorAll: () => [emptyCardArea] };
  unrenderedHand.rotateCards();
  assert.equal(emptyCardArea.style.transform, "translateX(153px)");
});

test("player hand draws only after a successful transfer and posts one Aria message", async () => {
  const events = [];
  const transferredCard = {
    id: "new-hand-card-id",
    toMessage: async message => events.push(["message", message]),
  };
  const deck = { type: "deck", cards: cardCollection([{ id: "deck-card-id" }]) };
  const actor = { id: "mage", getDefaultDeck: async () => deck };
  const { hand, document } = createHandFixture({
    document: {
      draw: async (source, number, options) => {
        events.push(["draw", source, number, options]);
        return [transferredCard];
      },
    },
  });
  runtime.settings.set("aria.deckSetting", { actorsByHandsID: { "hand-1": "mage" } });
  game.actors = collection([actor]);

  await hand.dispatchAction(handAction("drawCard").event);

  assert.deepEqual(events.map(([type]) => type), ["draw", "message"]);
  assert.equal(events[0][1], deck);
  assert.equal(events[0][2], 1);
  assert.deepEqual(events[0][3], { updateData: { face: 1 }, chatNotification: false });
  assert.equal(events[1][1].author, game.user.id);
  assert.deepEqual(hand.submissions, [{ operation: { render: false } }]);
  assert.deepEqual(document.nativeActions, []);
});

test("player hand omits the success message for empty, canceled, and failed draws", async () => {
  const events = [];
  const deck = { type: "deck", cards: cardCollection([{ id: "deck-card-id" }]) };
  const actor = { id: "mage", getDefaultDeck: async () => deck };
  const { hand, document } = createHandFixture({
    document: {
      draw: async () => {
        events.push(["draw"]);
        return [];
      },
    },
  });
  runtime.settings.set("aria.deckSetting", { actorsByHandsID: { "hand-1": "mage" } });
  game.actors = collection([actor]);
  await hand.dispatchAction(handAction("drawCard").event);
  assert.deepEqual(events, [["draw"]]);

  deck.cards = cardCollection([]);
  await hand.dispatchAction(handAction("drawCard").event);
  assert.deepEqual(events, [["draw"]]);
  deck.cards = cardCollection([{ id: "deck-card-id" }]);

  document.draw = async () => {
    events.push(["canceled"]);
    return null;
  };
  await hand.dispatchAction(handAction("drawCard").event);
  document.draw = async () => {
    events.push(["failed"]);
    throw new Error("draw failed");
  };
  await assert.rejects(hand.dispatchAction(handAction("drawCard").event), /draw failed/);
  assert.deepEqual(events, [["draw"], ["canceled"], ["failed"]]);
});

test("player hand play and discard send one message after a successful card transfer", async () => {
  const events = [];
  const discard = { type: "pile", id: "discard-1", cards: cardCollection([]) };
  const actor = {
    id: "mage",
    getDefaultDiscard: async () => discard,
  };
  const movedCard = {
    id: "new-discard-card-id",
    name: "Arcane",
    img: "arcane.png",
    description: "A spell",
    toMessage: async message => events.push(["message", message]),
  };
  const sourceCard = {
    id: "hand-card-id",
    name: "Arcane",
    img: "arcane.png",
    description: "A spell",
    pass: async (destination, options) => {
      events.push(["pass", destination, options]);
      return movedCard;
    },
  };
  const { hand } = createHandFixture({ cards: [sourceCard] });
  runtime.settings.set("aria.deckSetting", { actorsByHandsID: { "hand-1": "mage" } });
  game.actors = collection([actor]);

  await hand.dispatchAction(handAction("play", sourceCard.id).event);
  await hand.dispatchAction(handAction("discard", sourceCard.id).event);

  assert.deepEqual(events.map(([type]) => type), ["pass", "message", "pass", "message"]);
  assert.deepEqual(events[0], ["pass", discard, { chatNotification: false, action: "play" }]);
  assert.deepEqual(events[2], ["pass", discard, { chatNotification: false, action: "discard" }]);
  assert.equal(events[1][1].content.includes("Joue Arcane"), true);
  assert.equal(events[3][1].content.includes("Jette Arcane"), true);
  assert.equal(events[1][1].author, game.user.id);
  assert.equal(hand.submissions.length, 2);

  sourceCard.pass = async () => undefined;
  await hand.dispatchAction(handAction("play", sourceCard.id).event);
  assert.equal(events.length, 4);
  sourceCard.pass = async () => {
    throw new Error("transfer failed");
  };
  await assert.rejects(hand.dispatchAction(handAction("play", sourceCard.id).event), /transfer failed/);
  assert.equal(events.length, 4);
});

test("player hand reports missing associations and stale card IDs without TypeErrors", async () => {
  const notifications = [];
  const originalWarn = ui.notifications.warn;
  ui.notifications.warn = message => notifications.push(message);
  try {
    const { hand: missingActorHand } = createHandFixture({ cards: [{ id: "card" }] });
    runtime.settings.set("aria.deckSetting", undefined);
    game.actors = collection([]);
    await missingActorHand.dispatchAction(handAction("drawCard").event);
    runtime.settings.set("aria.deckSetting", {});
    await missingActorHand.dispatchAction(handAction("drawCard").event);
    runtime.settings.set("aria.deckSetting", { actorsByHandsID: {} });
    await missingActorHand.dispatchAction(handAction("discard", "card").event);
    await missingActorHand.dispatchAction(handAction("play").event);

    runtime.settings.set("aria.deckSetting", { actorsByHandsID: { "hand-1": "stale-actor" } });
    await missingActorHand.dispatchAction(handAction("drawCard").event);

    const actorWithoutDeck = { id: "mage" };
    runtime.settings.set("aria.deckSetting", { actorsByHandsID: { "hand-1": "mage" } });
    game.actors = collection([actorWithoutDeck]);
    const { hand: missingDeckMethodHand } = createHandFixture();
    await missingDeckMethodHand.dispatchAction(handAction("drawCard").event);

    const actor = { id: "mage", getDefaultDeck: async () => false, getDefaultDiscard: async () => false };
    game.actors = collection([actor]);
    const { hand: missingDeckHand } = createHandFixture();
    await missingDeckHand.dispatchAction(handAction("drawCard").event);
    const malformedDeckActor = { id: "mage", getDefaultDeck: async () => ({ cards: { contents: [] } }) };
    game.actors = collection([malformedDeckActor]);
    const { hand: malformedDeckHand } = createHandFixture();
    await malformedDeckHand.dispatchAction(handAction("drawCard").event);
    const incompleteDeckActor = {
      id: "mage",
      getDefaultDeck: async () => ({ cards: { get: () => undefined, contents: undefined } }),
    };
    game.actors = collection([incompleteDeckActor]);
    const { hand: incompleteDeckHand } = createHandFixture();
    await incompleteDeckHand.dispatchAction(handAction("drawCard").event);
    const { hand: missingDiscardHand } = createHandFixture({ cards: [{ id: "card" }] });
    await missingDiscardHand.dispatchAction(handAction("play", "card").event);

    const actorWithoutDiscard = { id: "mage", getDefaultDeck: async () => ({ cards: cardCollection([]) }) };
    game.actors = collection([actorWithoutDiscard]);
    const { hand: missingDiscardMethodHand } = createHandFixture({ cards: [{ id: "card" }] });
    await missingDiscardMethodHand.dispatchAction(handAction("discard", "card").event);
    const malformedDiscardActor = {
      id: "mage",
      getDefaultDiscard: async () => ({ cards: { contents: [] } }),
    };
    game.actors = collection([malformedDiscardActor]);
    const { hand: malformedDiscardHand } = createHandFixture({ cards: [{ id: "card" }] });
    await malformedDiscardHand.dispatchAction(handAction("discard", "card").event);

    const { hand: staleCardHand } = createHandFixture();
    await staleCardHand.dispatchAction(handAction("pass", "missing-card").event);
    const { hand: staleTransferHand } = createHandFixture();
    await staleTransferHand.dispatchAction(handAction("discard", "missing-card").event);

    assert.deepEqual(notifications, [
      "ARIA.cards.hand.actorMissing",
      "ARIA.cards.hand.actorMissing",
      "ARIA.cards.hand.actorMissing",
      "ARIA.cards.hand.cardMissing",
      "ARIA.cards.hand.actorMissing",
      "ARIA.cards.hand.deckMissing",
      "ARIA.cards.hand.deckMissing",
      "ARIA.cards.hand.deckMissing",
      "ARIA.cards.hand.deckMissing",
      "ARIA.cards.hand.discardMissing",
      "ARIA.cards.hand.discardMissing",
      "ARIA.cards.hand.discardMissing",
      "ARIA.cards.hand.cardMissing",
      "ARIA.cards.hand.cardMissing",
    ]);
    assert.equal(missingActorHand.submissions.length, 5);
    assert.equal(missingDeckHand.submissions.length, 1);
    assert.equal(missingDiscardHand.submissions.length, 1);
    assert.equal(missingDeckMethodHand.submissions.length, 1);
    assert.equal(missingDiscardMethodHand.submissions.length, 1);
    assert.equal(malformedDeckHand.submissions.length, 1);
    assert.equal(incompleteDeckHand.submissions.length, 1);
    assert.equal(malformedDiscardHand.submissions.length, 1);
    assert.equal(staleCardHand.submissions.length, 1);
    assert.equal(staleTransferHand.submissions.length, 1);
  } finally {
    ui.notifications.warn = originalWarn;
  }
});

test("legacy item preparation and card document hooks handle alternate document types", () => {
  const cases = [
    ["spell", { defBase: "1", defBonus: "2" }],
    ["profession", {}],
    ["origine", {}],
    ["trapping", {}],
    ["unknown", {}],
  ];
  for (const [type, system] of cases) {
    const value = Object.assign(new itemModule.AriaItem(), {
      type,
      name: "Silver Thorn",
      system,
    });
    value.prepareData();
    if (type === "spell") assert.equal(value.system.def, 3);
    if (type === "profession" || type === "origine") assert.equal(value.system.key, "silver-thorn");
  }
  const inherited = Object.assign(new itemModule.AriaItem(), { type: "unknown", system: {} });
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    inherited.prepareData = () => { throw new Error("invalid document data"); };
    assert.doesNotThrow(() => inherited.initialize());
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 2);
  assert.equal(Object.hasOwn(cardsModule.AriaCards.prototype, "_postChatNotification"), false);
});

test("item controllers prevent duplicate identities and confirm removal", async () => {
  const created = [];
  const actor = { name: "Ari", items: collection([]), createEmbeddedDocuments: (...args) => created.push(args), deleteEmbeddedDocuments: (...args) => created.push(["delete", ...args]) };
  const origin = { type: "origine", system: { competences: [{ name: "skill" }] } };
  originsModule.Origines.addToActor(actor, {}, origin);
  assert.equal(created[0][1].length, 2);
  actor.items = collection([item("origine", "Existing")]);
  assert.equal(originsModule.Origines.addToActor(actor, {}, origin), false);
  assert.equal(runtime.mockCalls.at(-1)[0], "notification");
  actor.items = collection([]);
  professionModule.Profession.addToActor(actor, {}, { system: { competences: [] } });
  assert.equal(created[1][1].length, 1);
  actor.items = collection([item("profession", "Existing")]);
  assert.equal(professionModule.Profession.addToActor(actor, {}, { system: { competences: [] } }), false);
  assert.equal(runtime.mockCalls.at(-1)[0], "notification");
  const entity = { id: "origin-1" };
  globalThis.__confirmYes = true;
  await originsModule.Origines.removeFromActor(actor, {}, entity);
  await professionModule.Profession.removeFromActor(actor, {}, entity);
  assert.equal(created.filter(call => call[0] === "delete").length, 2);
  globalThis.__confirmYes = false;
  assert.equal(await originsModule.Origines.removeFromActor(actor, {}, entity), false);
});

test("competence creation distinguishes ordinary from special competency", () => {
  const created = [];
  const actor = { createEmbeddedDocuments: (...args) => created.push(args) };
  competenceModule.Competence.create(actor);
  competenceModule.Competence.create(actor, true);
  assert.equal(created[0][1][0].data.special, undefined);
  assert.equal(created[1][1][0].data.special, true);
});

test("roll calculators apply labels, modifiers, scaling, and all roll modes", async () => {
  const rollEvent = attributes => ({ currentTarget: mockElement(attributes) });
  const actor = { id: "actor", system: { stats: { str: { base: 20 }, dex: { base: 20 } } } };
  assert.deepEqual(rollModule.AriaRoll.options(), { classes: ["aria", "dialog"] });
  runtime.settings.set("aria.carac100", true);
  runtime.resetCalls();
  rollModule.AriaRoll.skillCheck({}, actor, rollEvent({
    "data-rolling-value": "10", "data-rolling": "ARIA.Test",
  }), 2, "PUBLIC", "+5");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.mockCalls.at(-1)[0], "chatMessage");
  assert.match(runtime.mockCalls.at(-1)[1].content, /"cmpValue":25/);
  rollModule.AriaRoll.competencyCheck({}, actor, rollEvent({
    "data-rolling-value": "50", "data-rolling-bonus": "5", title: "Competence",
  }), "-2", "BLIND");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"cmpValue":53/);
  rollModule.AriaRoll.skillCheck({}, actor, rollEvent({
    "data-rolling-value": "5", "data-rolling": "",
  }), 1, "SELF", "+0");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"calcLabel":5/);
  rollModule.AriaRoll.skillCheck({}, actor, rollEvent({
    "data-rolling-value": "6", "data-rolling": "ARIA.Test",
  }), 2, "PUBLIC", "+0");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"calcLabel":"6x2"/);
  rollModule.AriaRoll.skillCheck({}, actor, rollEvent({
    "data-rolling-value": "6", "data-rolling": "ARIA.Test",
  }), 1, "PUBLIC", "+2");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtime.mockCalls.at(-1)[1].content.includes('"calcLabel":"6+2"'));
  rollModule.AriaRoll.competencyCheck({}, actor, rollEvent({
    "data-rolling-value": "10", "data-rolling-bonus": "-1", title: "Competence",
  }), "+3", "PRIVATE");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"cmpValue":12/);
  rollModule.AriaRoll.competencyCheck({}, actor, rollEvent({
    "data-rolling-value": "10", "data-rolling-bonus": "+0", title: "Competence",
  }), "", "PUBLIC");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"cmpValue":10/);
  rollModule.AriaRoll.competencyCheck({}, actor, rollEvent({
    "data-rolling-value": "10", "data-rolling-bonus": "2", title: "Competence",
  }), "3", "PUBLIC");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(runtime.mockCalls.at(-1)[1].content, /"cmpValue":15/);
  for (const [score, expected] of [[20, "+1"], [60, "+2"], [100, "+3"], [130, "+4"], [150, "+5"]]) {
    actor.system.stats.str.base = score;
    actor.system.stats.dex.base = 0;
    rollModule.AriaRoll.rollWeapon({}, actor, rollEvent({
      "data-roll-formula": "1d6", "data-roll-weapon-name": "Sword", "data-roll-weapon-img": "sword.png",
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(runtime.mockCalls.at(-1)[1].content.includes(`"formula":"1d6${expected}"`));
  }
  rollModule.AriaRoll.rollInitiative({}, actor, rollEvent({ "data-roll-formula": "4" }), "PRIVATE");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtime.mockCalls.at(-1)[1].content.includes('"formula":"1d6+4"'));
  runtime.settings.set("aria.carac100", false);
  rollModule.AriaRoll.rollWeapon({}, actor, rollEvent({
    "data-roll-formula": "1d6", "data-roll-weapon-name": "Sword", "data-roll-weapon-img": "sword.png",
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtime.mockCalls.at(-1)[1].content.includes('"formula":"1d6"'));
});

test("damage, initiative, and skill roll messages classify and publish deterministic results", async () => {
  for (const [RollClass, expectedTemplate, formula] of [
    [damageModule.AriaDamageRoll, "weapon-card", "2d6+2"],
    [initiativeModule.AriaInitiativeRoll, "initiative-card", "1d6+2"],
  ]) {
    globalThis.__rollTotal = 0;
    const roll = new RollClass("Test", formula, "icon.png");
    await roll.roll({ id: "actor" }, "BLIND");
    assert.equal(runtime.mockCalls.at(-1)[0], "chatMessage");
    assert.match(runtime.mockCalls.at(-1)[1].content, new RegExp(expectedTemplate));
    assert.equal(runtime.settings.get("core.rollMode"), "blind");
  }
  globalThis.__rollTotal = 100;
  await new skillModule.AriaSkillRoll("Test", "10+2", 50).roll({ id: "actor" }, "SELF");
  assert.equal(runtime.settings.get("core.rollMode"), "self");
  globalThis.__rollTotal = 1;
  await new skillModule.AriaSkillRoll("Perfect", "1", 1).roll({ id: "actor" }, "PUBLIC");
  assert.equal(runtime.settings.get("core.rollMode"), "public");
  for (const [RollClass, modes] of [
    [damageModule.AriaDamageRoll, ["PUBLIC", "BLIND", "SELF", "PRIVATE"]],
    [initiativeModule.AriaInitiativeRoll, ["PUBLIC", "BLIND", "SELF", "PRIVATE"]],
    [skillModule.AriaSkillRoll, ["PUBLIC", "BLIND", "SELF", "PRIVATE"]],
  ]) {
    for (const mode of modes) {
      const roll = RollClass === skillModule.AriaSkillRoll
        ? new RollClass("Test", "10", 10)
        : new RollClass("Test", "1d6", "icon.png");
      await roll.roll({ id: "actor" }, mode);
    }
  }
  assert.equal(statsModule.Stats.getModFromStatValue(3), -4);
  assert.equal(statsModule.Stats.getModFromStatValue(14), 2);
  assert.equal(statsModule.Stats.getStatValueFromMod(2), 14);
  assert.equal(macrosModule.Macros.name, "Macros");
});

test("token HP bars convert wounds to value and clamp below zero", () => {
  const token = Object.assign(new tokenModule.AriaTokenDocument(), {
    actor: { system: { attributes: { hp: { max: 10, bonus: 13 } } } },
    baseBar: { attribute: "attributes.hp", value: 2, max: 2 },
  });
  assert.deepEqual(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), { attribute: "attributes.hp", value: 0, max: 10 });
  token.actor.system.attributes.hp.bonus = 3;
  assert.deepEqual(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), { attribute: "attributes.hp", value: 7, max: 10 });
  token.baseBar = { attribute: "attributes.mp", value: 2, max: 2 };
  assert.deepEqual(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), { attribute: "attributes.mp", value: 2, max: 2 });
  token.baseBar = null;
  assert.equal(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), null);
  token.actor.system.attributes.hp = { max: 10, bonus: 10 };
  token.baseBar = { attribute: "attributes.hp", value: 1, max: 1 };
  assert.deepEqual(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), {
    attribute: "attributes.hp", value: 0, max: 10,
  });
  token.actor.system.attributes.hp = { max: 0, bonus: 0 };
  token.baseBar = { attribute: "attributes.hp", value: 1, max: 1 };
  assert.deepEqual(tokenModule.AriaTokenDocument.prototype.getBarAttribute.call(token), {
    attribute: "attributes.hp", value: 10, max: 10,
  });
});

test("settings and templates register declared settings and preload paths", async () => {
  runtime.settings.clear();
  settingsModule.registerSystemSettings();
  assert.equal(runtime.settings.get("aria.ariaVersion.definition").default, "aria");
  assert.equal(runtime.settings.get("aria.deckSetting.definition").default.handsByActorID instanceof Object, true);
  const paths = await templatesModule.preloadHandlebarsTemplates();
  assert.ok(paths.includes("systems/aria/templates/actors/character/parts/character-header.hbs"));
  assert.ok(paths.includes("systems/aria/templates/items/item-sheet.hbs"));
  for (const path of paths) {
    const systemRelativePath = path.replace(/^systems\/aria\//, "");
    assert.ok(existsSync(new URL(`../${systemRelativePath}`, import.meta.url)), `missing preloaded template: ${path}`);
  }

  const templateRoot = join(fileURLToPath(new URL("../", import.meta.url)), "templates");
  const editorDirectives = recursivelyListFiles(templateRoot)
    .filter(path => path.endsWith(".hbs"))
    .flatMap(path => [...readFileSync(path, "utf8").matchAll(/\{\{editor\b[^}]*\}\}/g)].map(([directive]) => directive));
  assert.ok(editorDirectives.length > 0);
  for (const directive of editorDirectives) {
    assert.match(directive, /\bengine=editorEngine\b/, `editor does not use the runtime engine: ${directive}`);
  }
});

test("chat visibility removes the appropriate card for authors, recipients, and blind viewers", async () => {
  const removed = [];
  const cardElement = {
    querySelector: selector => ({ remove: () => removed.push(selector) }),
  };
  const html = {
    find(selector) {
      if (selector === ".message-content") return { html: content => { this.content = content; } };
      if (selector === ".aria-roll-chat") return [cardElement];
      return { length: 0 };
    },
  };
  game.user.id = "user-1";
  await chatModule.sortCustomAgeChatCards(
    { content: "<div class='aria-roll-chat'></div>", blind: false },
    html,
    { message: { whisper: [] }, author: { id: "other" } },
  );
  assert.deepEqual(removed, [".blind-roll-card"]);
  await chatModule.sortCustomAgeChatCards(
    { content: "<div class='aria-roll-chat'></div>", blind: true },
    html,
    { message: { whisper: ["someone-else"] }, author: { id: "other" } },
  );
  assert.equal(removed.at(-1), ".regular-roll-card");
  await chatModule.sortCustomAgeChatCards(
    { content: "aria-roll-chat", blind: true },
    html,
    { message: { whisper: ["user-1"] }, author: { id: "other" } },
  );
  assert.equal(removed.at(-1), ".blind-roll-card");
  await chatModule.sortCustomAgeChatCards(
    { content: "plain text", blind: true },
    { find: () => ({ length: 0 }) },
    { message: { whisper: ["user-1"] }, author: { id: "other" } },
  );
  assert.equal(removed.length, 3);
});

test("module initialization registers Foundry classes, sheets, helpers, and hooks", async () => {
  const init = runtime.hooks.once.get("init");
  assert.equal(typeof init, "function");
  await init();
  assert.equal(CONFIG.Actor.documentClass, actorModule.AriaActor);
  assert.equal(CONFIG.Token.documentClass, tokenModule.AriaTokenDocument);
  assert.equal(game.aria.config, config.ARIA);
  assert.ok(runtime.helpers.has("getOrigines"));
  assert.ok(runtime.mockCalls.some(call => call[0] === "registerActorSheet"));
  assert.equal(typeof runtime.hooks.once.get("setup"), "function");
  runtime.hooks.once.get("setup")();
  assert.equal(CONFIG.ARIA.languages.common, "ARIA.languages.Common");
  assert.equal(typeof runtime.hooks.on.get("hotbarDrop"), "function");
  assert.equal(typeof runtime.hooks.on.get("renderChatMessage"), "function");
  assert.equal(typeof runtime.hooks.on.get("updateActor"), "function");
  await runtime.hooks.on.get("renderChatMessage")(
    { content: "plain text", blind: false },
    { find: () => ({ length: 0 }) },
    { message: { whisper: [] }, author: { id: game.user.id } },
  );
});

test("ready hook loads configured packs and migrates magical characters for a GM", async () => {
  const ready = runtime.hooks.once.get("ready");
  const packReads = [];
  game.packs.get = name => ({
    getDocuments: async () => {
      packReads.push(name);
      return [{ toObject: () => ({ pack: name }) }];
    },
  });
  game.settings.set = async (namespace, key, value) => {
    runtime.settings.set(`${namespace}.${key}`, value);
    return value;
  };
  runtime.settings.set("aria.ariaVersion", "aria");
  runtime.settings.set("aria.systemMigrationVersion", "");
  const migrated = [];
  const character = {
    type: "character",
    items: collection([
      item("competence", "Saut", { special: false }),
      item("competence", "Modélisation", { special: true }),
    ]),
    getDefaultHand: () => false,
    createDefaultCards: async () => migrated.push("cards"),
    toObject: () => ({ prototypeToken: { actorLink: false, sight: { enabled: false }, disposition: 0 } }),
    update: async value => migrated.push(value),
  };
  game.actors = collection([character]);
  game.user.isGM = true;
  await ready();
  assert.ok(packReads.includes("aria.professions"));
  assert.deepEqual(migrated[0], "cards");
  assert.equal(migrated[1].prototypeToken.actorLink, true);
  assert.equal(migrated[1].prototypeToken.sight.enabled, true);
  assert.equal(migrated[1].prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
  assert.equal(runtime.settings.get("aria.systemMigrationVersion"), game.system.version);
});

test("ready hook resets unknown skin settings and stops migration for non-GMs", async () => {
  const ready = runtime.hooks.once.get("ready");
  game.packs.get = () => ({ getDocuments: async () => [] });
  runtime.settings.set("aria.ariaVersion", "unknown");
  runtime.settings.set("aria.systemMigrationVersion", "");
  game.user.isGM = false;
  await ready();
  assert.equal(runtime.settings.get("aria.ariaVersion"), "aria");
});

test("ready hook records migration version for an empty world and skips current worlds", async () => {
  const ready = runtime.hooks.once.get("ready");
  game.packs.get = () => ({ getDocuments: async () => [] });
  game.user.isGM = true;
  game.actors = {
    size: 0,
    filter: () => assert.fail("empty worlds with no saved version should skip migration"),
  };
  runtime.settings.set("aria.ariaVersion", "aria");
  runtime.settings.set("aria.systemMigrationVersion", undefined);
  await ready();
  assert.equal(runtime.settings.get("aria.systemMigrationVersion"), game.system.version);

  game.actors = collection([]);
  runtime.settings.set("aria.systemMigrationVersion", game.system.version);
  await ready();
  assert.equal(runtime.settings.get("aria.systemMigrationVersion"), game.system.version);
});

test("ready hook migrates a non-empty world with no recorded version", async () => {
  const ready = runtime.hooks.once.get("ready");
  game.packs.get = () => ({ getDocuments: async () => [] });
  game.user.isGM = true;
  game.actors = collection([{ type: "npc" }]);
  runtime.settings.set("aria.ariaVersion", "aria");
  runtime.settings.set("aria.systemMigrationVersion", undefined);
  await ready();
  assert.equal(runtime.settings.get("aria.systemMigrationVersion"), game.system.version);
});

test("ready hook migrates when the recorded system version is obsolete", async () => {
  const ready = runtime.hooks.once.get("ready");
  game.packs.get = () => ({ getDocuments: async () => [] });
  game.user.isGM = true;
  game.actors = collection([]);
  runtime.settings.set("aria.ariaVersion", "aria");
  runtime.settings.set("aria.systemMigrationVersion", "0.9.0");
  await ready();
  assert.equal(runtime.settings.get("aria.systemMigrationVersion"), game.system.version);
});

test("actor updates refresh player list and synchronize card ownership for current user", () => {
  const rendered = [];
  ui.players.render = force => rendered.push(force);
  const syncs = [];
  const actor = {
    type: "character",
    items: collection([
      item("competence", "Saut", { special: false }),
      item("competence", "Modélisation", { special: true }),
    ]),
    getDefaultHand: () => ({ update: (...args) => syncs.push(["hand", ...args]) }),
    getDefaultDeck: () => ({ update: (...args) => syncs.push(["deck", ...args]) }),
    getDefaultDiscard: () => ({ update: (...args) => syncs.push(["discard", ...args]) }),
    getCardOwnership: () => ({ player: 3 }),
  };
  runtime.hooks.on.get("updateActor")(actor, { ownership: {} }, {}, game.userId);
  assert.deepEqual(rendered, [true]);
  assert.deepEqual(syncs.map(([target]) => target), ["hand", "deck", "discard"]);
  assert.deepEqual(syncs[0][1], { ownership: { player: 3 } });
  assert.deepEqual(syncs[0][2], { diff: false, recursive: false });
  runtime.hooks.on.get("updateActor")({ type: "npc", items: [] }, {}, {}, game.userId);
  runtime.hooks.on.get("updateActor")({ type: "character", items: [] }, {}, {}, game.userId);
  assert.deepEqual(rendered, [true, true, true]);
});

test("hotbar actor drops create and assign a macro only when absent", async () => {
  const callback = runtime.hooks.on.get("hotbarDrop");
  const actor = { id: "a", name: "Ari", img: "actor.png" };
  fromUuid = async () => actor;
  game.macros.contents = [];
  const assigned = [];
  game.user.assignHotbarMacro = (macro, slot) => assigned.push([macro, slot]);
  await callback(null, { type: "Actor", id: "a", uuid: "Actor.a" }, 2);
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0][0].name, "Ari");
  await callback(null, { type: "JournalEntry", id: "j" }, 3);
  assert.equal(assigned.length, 1);
  game.macros.contents = [assigned[0][0]];
  await callback(null, { type: "Actor", id: "a", uuid: "Actor.a" }, 4);
  assert.equal(assigned.length, 1);
});

test("system-ready module has no executable behavior to invoke", () => {
  assert.equal(typeof systemReadyModule.default, "object");
  assert.equal(Object.keys(systemReadyModule).includes("default"), true);
});

test("modern initialization registers every Aria insert without TinyMCE", async () => {
  const originalTextEditor = CONFIG.TextEditor;
  const originalTinyMce = CONFIG.TinyMCE;
  delete CONFIG.TinyMCE;
  CONFIG.TextEditor = { inserts: [] };

  try {
    await runtime.hooks.once.get("init")();
    assert.equal("TinyMCE" in CONFIG, false);
    const insertGroups = CONFIG.TextEditor.inserts.filter(insert => insert.action === "aria-editor-inserts");
    assert.equal(insertGroups.length, 1);
    assert.equal(insertGroups[0].title, "Aria");
    assert.deepEqual(
      insertGroups[0].children.map(({ title, html }) => [title, html]),
      ariaPresetDefinitions.map(([title, classes]) => [
        title,
        `<section class="${classes}"><selection></selection></section>`,
      ]),
    );
    assert.equal(new Set(insertGroups[0].children.map(({ action }) => action)).size, 18);

    editorModule.registerAriaEditorOptions();
    assert.equal(CONFIG.TextEditor.inserts.filter(insert => insert.action === "aria-editor-inserts").length, 1);

    const journalScss = readFileSync(new URL("../scss/global/_journal.scss", import.meta.url), "utf8");
    const journalCss = readFileSync(new URL("../css/aria.css", import.meta.url), "utf8");
    assert.match(journalScss, /\.editor\.prosemirror\s+\.editor-content/);
    assert.match(journalCss, /\.editor\.prosemirror\s+\.editor-content/);
    const retainedClasses = new Set(ariaPresetDefinitions.flatMap(([, classes]) => classes.split(" ")));
    retainedClasses.delete("aria-secret");
    for (const className of retainedClasses) {
      assert.ok(journalScss.includes(`.${className}`), `missing retained rich-text style for ${className}`);
      assert.ok(journalCss.includes(`.${className}`), `compiled rich-text style is missing ${className}`);
    }
    assert.ok(retainedClasses.has("secret"));
  } finally {
    if (originalTextEditor === undefined) delete CONFIG.TextEditor;
    else CONFIG.TextEditor = originalTextEditor;
    if (originalTinyMce === undefined) delete CONFIG.TinyMCE;
    else CONFIG.TinyMCE = originalTinyMce;
  }
});

test("legacy initialization config retains TinyMCE presets only when ProseMirror inserts are absent", () => {
  const originalTextEditor = CONFIG.TextEditor;
  const originalTinyMce = CONFIG.TinyMCE;
  delete CONFIG.TextEditor;
  CONFIG.TinyMCE = { content_css: [], style_formats: [] };

  try {
    editorModule.registerAriaEditorOptions();
    assert.equal(editorModule.getEditorEngine(), "tinymce");
    assert.deepEqual(CONFIG.TinyMCE.content_css, ["/systems/aria/css/aria_TinyMCE.css"]);
    const styleGroups = CONFIG.TinyMCE.style_formats.filter(group => group.title === "Aria");
    assert.equal(styleGroups.length, 1);
    assert.deepEqual(
      styleGroups[0].items.map(({ title, block, classes, wrapper }) => [title, block, classes, wrapper]),
      ariaPresetDefinitions.map(([title, classes]) => [title, "section", classes, true]),
    );
    editorModule.registerAriaEditorOptions();
    assert.equal(CONFIG.TinyMCE.content_css.length, 1);
    assert.equal(CONFIG.TinyMCE.style_formats.filter(group => group.title === "Aria").length, 1);

    CONFIG.TinyMCE = {};
    editorModule.registerAriaEditorOptions();
    assert.deepEqual(CONFIG.TinyMCE.content_css, ["/systems/aria/css/aria_TinyMCE.css"]);
    assert.equal(CONFIG.TinyMCE.style_formats[0].items.length, 18);
    assert.equal(editorModule.getEditorEngine(), "tinymce");

    delete CONFIG.TinyMCE;
    assert.equal(editorModule.getEditorEngine(), "prosemirror");
    editorModule.registerAriaEditorOptions();
  } finally {
    if (originalTextEditor === undefined) delete CONFIG.TextEditor;
    else CONFIG.TextEditor = originalTextEditor;
    if (originalTinyMce === undefined) delete CONFIG.TinyMCE;
    else CONFIG.TinyMCE = originalTinyMce;
  }

  const originalConfig = globalThis.CONFIG;
  try {
    globalThis.CONFIG = undefined;
    assert.equal(editorModule.getEditorEngine(), "prosemirror");
    editorModule.registerAriaEditorOptions();
  } finally {
    globalThis.CONFIG = originalConfig;
  }
});

test("actor and item sheets choose the current engine dynamically", async () => {
  const originalTextEditor = CONFIG.TextEditor;
  const originalTinyMce = CONFIG.TinyMCE;
  const actor = {
    isOwner: true,
    limited: false,
    items: collection([]),
    toObject: () => ({ system: { description: "Biography" }, items: [] }),
  };
  const actorSheet = Object.assign(new actorSheetModule.AriaActorSheet(), { actor, options: {} });
  const originalItemSheetGetData = ItemSheet.prototype.getData;
  ItemSheet.prototype.getData = function () {
    return { item: { type: this.item.type } };
  };
  const itemSheet = Object.assign(new itemSheetModule.AriaItemSheet(), {
    item: item("item", "Editor Item", { description: "Description", properties: {} }),
    options: {},
  });

  try {
    CONFIG.TextEditor = { inserts: [] };
    delete CONFIG.TinyMCE;
    assert.equal((await actorSheet.getData()).editorEngine, "prosemirror");
    assert.equal((await itemSheet.getData()).editorEngine, "prosemirror");

    delete CONFIG.TextEditor;
    CONFIG.TinyMCE = { content_css: [], style_formats: [] };
    assert.equal((await actorSheet.getData()).editorEngine, "tinymce");
    assert.equal((await itemSheet.getData()).editorEngine, "tinymce");
  } finally {
    if (originalTextEditor === undefined) delete CONFIG.TextEditor;
    else CONFIG.TextEditor = originalTextEditor;
    if (originalTinyMce === undefined) delete CONFIG.TinyMCE;
    else CONFIG.TinyMCE = originalTinyMce;
    ItemSheet.prototype.getData = originalItemSheetGetData;
  }

  const itemTemplate = readFileSync(new URL("../templates/items/item-sheet.hbs", import.meta.url), "utf8");
  const actorTemplate = readFileSync(new URL("../templates/actors/character/parts/stats/character-stats.hbs", import.meta.url), "utf8");
  assert.match(itemTemplate, /engine=editorEngine/);
  assert.match(actorTemplate, /engine=editorEngine/);
});

test("manifest preserves the minimum and declares the tested current Foundry version", () => {
  const manifest = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));
  assert.equal(manifest.compatibility.minimum, "13.345");
  assert.equal(manifest.compatibility.verified, "14.369");
  assert.ok(manifest.esmodules.includes("module/aria.js"));
  assert.ok(manifest.styles.includes("css/aria.css"));
  for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.packs.map(pack => pack.path), manifest.license]) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `missing manifest resource: ${path}`);
  }
  for (const language of manifest.languages) {
    assert.equal(language.path, `lang/${language.lang}.json`);
    const locale = JSON.parse(readFileSync(new URL(`../${language.path}`, import.meta.url), "utf8"));
    assert.equal(locale["ARIA.title"], "Aria");
  }
});

test("Foundry v14 roll cards use rolls and an explicit author instead of removed chat fields", async () => {
  for (const RollClass of [damageModule.AriaDamageRoll, initiativeModule.AriaInitiativeRoll, skillModule.AriaSkillRoll]) {
    const roll = RollClass === skillModule.AriaSkillRoll
      ? new RollClass("Test", "10", 10)
      : new RollClass("Test", "1d6", "icon.png");
    await roll.roll({ id: "actor" }, "PUBLIC");
    const message = runtime.mockCalls.filter(([action]) => action === "chatMessage").at(-1)[1];
    assert.equal(message.author, game.user.id);
    assert.equal("user" in message, false);
    assert.equal("type" in message, false);
    assert.deepEqual(message.rolls, [message.roll]);
  }
  assert.equal("CHAT_MESSAGE_STYLES" in CONST, false);
});

test("compendium traversal resolves active references with getDocument only", async () => {
  const expected = { id: "compendium-document" };
  const requests = [];
  game.items = collection([]);
  game.packs = {
    get: () => ({
      getDocument: async id => {
        requests.push(id);
        return id === expected.id ? expected : undefined;
      },
    }),
  };
  assert.equal(await traversal.Traversal.getEntity(expected.id, "item", "aria.test"), expected);
  assert.deepEqual(requests, [expected.id]);
  assert.equal(await traversal.Traversal.getEntity("missing", "item", "aria.test"), undefined);
  assert.deepEqual(requests, [expected.id, "missing"]);
});

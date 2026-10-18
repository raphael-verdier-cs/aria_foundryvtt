export function installFoundryMocks() {
  const hooks = { once: new Map(), on: new Map() };
  const helpers = new Map();
  const settings = new Map();
  const mockCalls = [];
  const emptyCollection = () => ({
    contents: [],
    get: () => undefined,
    find: () => undefined,
    filter: () => [],
    size: 0,
  });

  class FoundryDocument {
    static async create(data) {
      return data;
    }

    async _preCreate() {}
    prepareBaseData() {}
    prepareData() {}
    prepareDerivedData() {}
    async modifyTokenAttribute() {}
    async update() {}
    updateSource(data) {
      Object.assign(this, data);
    }
    toObject() {
      return structuredClone(this);
    }
    async deleteDialog() {}
  }

  class FoundrySheet {
    static get defaultOptions() {
      return { classes: [], tabs: [], dragDrop: [] };
    }
    activateListeners() {}
    getData() {
      return {};
    }
    setPosition(options) {
      return { height: 400, ...options };
    }
    render() {}
    async _onSubmit() {}
  }

  class FoundryForm extends FoundrySheet {}
  class FoundryCardHand extends FoundrySheet {
    async activateListeners() {}
  }
  class FoundryCards extends FoundryDocument {}
  class FoundryTokenDocument {
    getBarAttribute() {
      return this.baseBar ?? null;
    }
  }

  globalThis.Actor = FoundryDocument;
  globalThis.Item = FoundryDocument;
  globalThis.ActorSheet = FoundrySheet;
  globalThis.ItemSheet = FoundrySheet;
  globalThis.FormApplication = FoundryForm;
  globalThis.CardHand = FoundryCardHand;
  globalThis.Cards = FoundryCards;
  globalThis.TokenDocument = FoundryTokenDocument;

  globalThis.foundry = {
    utils: {
      duplicate: value => structuredClone(value),
      mergeObject: (target, source) => Object.assign(target, source),
      isNewerVersion: (current, previous) => current > previous,
    },
  };
  globalThis.CONFIG = {
    Actor: {},
    Item: {},
    Token: {},
    Combat: {},
    Cards: {},
    sounds: { dice: "dice-sound" },
  };
  globalThis.CONST = {
    TOKEN_DISPOSITIONS: { FRIENDLY: 1 },
    DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 },
    DICE_ROLL_MODES: {
      PUBLIC: "public",
      BLIND: "blind",
      SELF: "self",
      PRIVATE: "private",
    },
  };
  globalThis.game = {
    settings: {
      get: (namespace, key) => settings.get(`${namespace}.${key}`),
      set: async (namespace, key, value) => {
        settings.set(`${namespace}.${key}`, value);
        return value;
      },
      register: (namespace, key, value) => settings.set(`${namespace}.${key}.definition`, value),
      registerMenu: (namespace, key, value) => settings.set(`${namespace}.${key}.menu`, value),
    },
    packs: {
      get: () => undefined,
      find: () => undefined,
    },
    items: emptyCollection(),
    actors: emptyCollection(),
    journal: emptyCollection(),
    cards: emptyCollection(),
    macros: emptyCollection(),
    user: { id: "user-1", isGM: false, assignHotbarMacro: (...args) => mockCalls.push(["assignHotbarMacro", ...args]) },
    userId: "user-1",
    system: { version: "1.0.0", flags: { needsMigrationVersion: "1.0.0" } },
    i18n: { localize: key => key },
  };
  globalThis.game.aria = { config: {} };
  globalThis.System = { name: "aria", dataPath: "/systems/aria/_data", templatesPath: "/systems/aria/templates" };
  if (!String.prototype.slugify) {
    Object.defineProperty(String.prototype, "slugify", {
      configurable: true,
      value() {
        return this.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      },
    });
  }
  if (!String.prototype.titleCase) {
    Object.defineProperty(String.prototype, "titleCase", {
      configurable: true,
      value() {
        return `${this.charAt(0).toUpperCase()}${this.slice(1)}`;
      },
    });
  }
  globalThis.game.charactersMagic = [];
  globalThis.ui = { notifications: { error: message => mockCalls.push(["notification", message]) }, players: { render: () => {} } };
  globalThis.Hooks = {
    once: (name, callback) => hooks.once.set(name, callback),
    on: (name, callback) => hooks.on.set(name, callback),
  };
  globalThis.Handlebars = { registerHelper: (name, fn) => helpers.set(name, fn) };
  globalThis.Actors = { unregisterSheet: (...args) => mockCalls.push(["unregisterActorSheet", ...args]), registerSheet: (...args) => mockCalls.push(["registerActorSheet", ...args]) };
  globalThis.Items = { unregisterSheet: (...args) => mockCalls.push(["unregisterItemSheet", ...args]), registerSheet: (...args) => mockCalls.push(["registerItemSheet", ...args]) };
  globalThis.DocumentSheetConfig = { registerSheet: (...args) => mockCalls.push(["registerCardSheet", ...args]) };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor }) => ({ actor: actor?.id }),
    applyRollMode: async (data, mode) => ({ ...data, rollMode: mode }),
    create: data => mockCalls.push(["chatMessage", data]),
  };
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
      this.total = globalThis.__rollTotal ?? 42;
      this.result = `${this.total}`;
      this.terms = formula.includes("+") ? [1, 2] : [1];
    }
    async evaluate() {}
    async render() {
      return `<roll>${this.total}</roll>`;
    }
  };
  globalThis.Dialog = class {
    constructor(data, options) {
      this.data = data;
      this.options = options;
      mockCalls.push(["dialog", data, options]);
    }
    render() {
      return this;
    }
    static async confirm(data) {
      mockCalls.push(["confirm", data]);
      return globalThis.__confirmYes ? data.yes() : false;
    }
  };
  globalThis.TextEditor = { enrichHTML: async content => `enriched:${content}` };
  globalThis.renderTemplate = async (path, data) => `${path}:${JSON.stringify(data)}`;
  globalThis.loadTemplates = async paths => paths;
  globalThis.fromUuid = async () => ({ actor: null });
  globalThis.Macro = { create: async data => data };
  globalThis.ImagePopout = class {
    constructor(image, options) {
      this.image = image;
      this.options = options;
      mockCalls.push(["imagePopout", image, options]);
    }
    render() {
      return { shareImage: () => mockCalls.push(["shareImage"]) };
    }
  };
  globalThis.getDocumentClass = () => ({ createDialog: (...args) => mockCalls.push(["createDialog", ...args]) });
  globalThis.expandObject = value => value;
  globalThis.FormDataExtended = class {
    constructor() {
      this.object = { multi: 2, bonusMalus: "0" };
    }
  };
  globalThis.$ = value => value?.jqueryWrapper ? value : ({
    0: value?.currentTarget ?? value,
    data: key => value?.dataset?.[key],
    find: selector => value?.find?.(selector) ?? { length: 0 },
    closest: selector => value?.closest?.(selector) ?? value,
    parents: selector => value?.parents?.(selector) ?? value,
    addClass: name => value?.classList?.add(name),
    removeClass: name => value?.classList?.remove(name),
  });

  return {
    hooks,
    helpers,
    settings,
    mockCalls,
    resetCalls: () => mockCalls.splice(0),
  };
}

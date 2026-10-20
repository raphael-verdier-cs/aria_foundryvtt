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
  const mergeApplicationOptions = (target, source) => {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (Array.isArray(value)) {
        target[key] = [...(target[key] ?? []), ...value];
      } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
        target[key] ??= {};
        mergeApplicationOptions(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  };
  const applicationOptionsFor = (applicationClass, options) => {
    const defaults = [];
    for (let current = applicationClass; current && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
      if (Object.hasOwn(current, "DEFAULT_OPTIONS")) defaults.unshift(current.DEFAULT_OPTIONS);
    }
    defaults.push(options);
    return defaults.reduce(mergeApplicationOptions, {});
  };

  class FoundryApplicationV2 {
    static DEFAULT_OPTIONS = {
      actions: {},
      classes: [],
      position: {},
      window: { resizable: false },
      form: { closeOnSubmit: false, submitOnChange: false },
    };

    constructor(options = {}) {
      this.options = applicationOptionsFor(this.constructor, options);
      this.document = options.document ?? this.options.document;
      this.form = this.options.tag === "form" ? { hasAttribute: () => false } : null;
      this.element = options.element;
      this.rendered = false;
      this.minimized = false;
    }

    async submit(options = {}) {
      this.form.hasAttribute("data-action");
      this.submissions ??= [];
      this.submissions.push(options);
    }

    async dispatchAction(event) {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const handler = this.options.actions[target.dataset.action];
      if (!handler) return this._onClickAction(event, target);
      return handler.call(this, event, target);
    }

    _onClickAction() {}
    async _onRender(context, options) {
      this.applicationRenderCalls ??= [];
      this.applicationRenderCalls.push([context, options]);
    }

    render(force) {
      this.rendered = Boolean(force);
      this.renderCalls ??= [];
      this.renderCalls.push(force);
      return this;
    }

    close() {
      this.rendered = false;
      return this;
    }

    maximize() {
      this.minimized = false;
      return this;
    }
  }

  class FoundryDocumentSheetV2 extends FoundryApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ["sheet"],
      document: null,
      form: { handler: true },
      tag: "form",
    };

    async _prepareContext() {
      return { document: this.document, editable: true };
    }
  }

  class FoundryCardsConfig extends FoundryDocumentSheetV2 {
    static DEFAULT_OPTIONS = {
      actions: {
        controlCard: function () {
          return this.document.nativeActions.push(["controlCard"]);
        },
        pass: function () {
          return this.document.passDialog();
        },
        reset: function () {
          return this.document.nativeActions.push(["reset"]);
        },
        shuffle: function () {
          return this.document.nativeActions.push(["shuffle"]);
        },
        toggleSort: function () {
          return this.document.nativeActions.push(["toggleSort"]);
        },
      },
      classes: ["cards-config"],
      position: { width: 720 },
    };

    async _preparePartContext(partId, context) {
      const partContext = { ...context };
      if (partId === "cards") {
        partContext.cards = this.document.cards.contents;
        partContext.cardTypes = {};
        partContext.sortModeIcon = "fa-random";
      }
      return partContext;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      this.nativeRenderCalls ??= [];
      this.nativeRenderCalls.push(["cards-config", options]);
      this.nativeDragDropSelector = "ol[data-cards] > li";
    }
  }

  class FoundryCardHandConfig extends FoundryCardsConfig {
    static DEFAULT_OPTIONS = {
      actions: {
        draw: function () {
          return this.document.drawDialog();
        },
      },
    };

    static PARTS = {
      cards: { root: true, scrollable: ["ol[data-cards]"], template: "native-hand.hbs" },
      footer: { template: "native-footer.hbs" },
    };
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
  globalThis.Cards = FoundryCards;
  globalThis.TokenDocument = FoundryTokenDocument;

  globalThis.foundry = {
    applications: {
      sheets: { CardHandConfig: FoundryCardHandConfig },
    },
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
  globalThis.ui = {
    notifications: {
      error: message => mockCalls.push(["notification", message]),
      warn: message => mockCalls.push(["warning", message]),
    },
    players: { render: () => {} },
  };
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

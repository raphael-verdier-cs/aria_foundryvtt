const SECTION_HEADING = "competences speciales";
const HEADING_SELECTOR = /^h([1-6])$/;
const BLOCK_TAGS = new Set(["blockquote", "br", "div", "li", "ol", "p", "pre", "table", "td", "th", "tr", "ul"]);
const DICE_EXPRESSION = /(?<![\p{L}\p{N}_@])\d+[dD]\d+(?:\s*[+-]\s*\d+)?/gu;
const DIRECT_CHECK = /\b(?:(?:faire|réussir|effectuer|tenter|lancer)\s+(?:immédiatement\s+)?un\s+jet|via\s+un\s+jet)(?:\s+(?:de|sous)\s+([^.!?;\n]+))?/giu;
const PERCENTAGE = /[+-]?\d{1,4}\s*%/gu;
const ABILITY_PERCENTAGE = /(?:^|[\n.!?;])\s*([^:;.!?\n]{1,64}?\??)\s*:\s*([+-]?\d{1,4})\s*%(?![\p{L}\p{N}])/gu;

const normalizeText = value => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\u00a0/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("fr");

const cleanText = value => String(value).replace(/\s+/g, " ").trim();

const addBoundary = state => {
  if (state.current.trim()) {
    state.lines.push(cleanText(state.current));
    state.current = "";
  }
};

/**
 * Read the current special-ability section from rendered Actor HTML without mutating it.
 * @param {string} description Current Actor description HTML.
 * @param {Document} documentRef Browser document used for inert template parsing.
 * @returns {string[]} Text blocks between the normalized section heading and the next same/higher heading.
 */
export function extractSpecialAbilitySection(description, documentRef = globalThis.document) {
  if (typeof description !== "string" || !description.trim()) return [];
  if (typeof documentRef?.createElement !== "function") return [];

  const template = documentRef.createElement("template");
  template.innerHTML = description;
  if (!template.content) return [];

  const state = { found: false, stopped: false, level: 0, current: "", lines: [] };
  const visit = node => {
    if (state.stopped) return;
    if (node.nodeType === 1) {
      const tagName = String(node.tagName).toLowerCase();
      const headingMatch = HEADING_SELECTOR.exec(tagName);
      if (headingMatch) {
        const level = Number(headingMatch[1]);
        if (!state.found) {
          if (normalizeText(node.textContent) === SECTION_HEADING) {
            state.found = true;
            state.level = level;
          }
          return;
        }
        if (level <= state.level) {
          addBoundary(state);
          state.stopped = true;
          return;
        }
        addBoundary(state);
        state.lines.push(cleanText(node.textContent));
        return;
      }

      const isBlock = BLOCK_TAGS.has(tagName);
      if (state.found && isBlock) addBoundary(state);
      for (const child of node.childNodes) visit(child);
      if (state.found && isBlock) addBoundary(state);
      return;
    }
    if (node.nodeType === 3 && state.found) state.current += node.textContent;
  };

  for (const child of template.content.childNodes) visit(child);
  addBoundary(state);
  return state.lines.filter(Boolean);
}

const strictInteger = value => {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const isFormulaBoundary = (text, start, end) => {
  const before = text[start - 1] ?? "";
  const after = text[end] ?? "";
  if (/[\p{L}\p{N}_@()+\-*/^]/u.test(before) || /[\p{L}\p{N}_@()+\-*/^]/u.test(after)) return false;
  if (after === "." && /^\.\d/.test(text.slice(end))) return false;
  if (/\s*[+\-*/^@]\s*$/.test(text.slice(0, start))) return false;
  if (/^\s*[+\-*/^@]/.test(text.slice(end))) return false;
  return true;
};

const parseDiceExpression = expression => {
  const match = /^(\d+)[dD](\d+)(?:([+-])(\d+))?$/.exec(expression);
  if (!match) return null;

  const dice = Number(match[1]);
  const faces = Number(match[2]);
  const modifier = match[4] ? Number(`${match[3]}${match[4]}`) : 0;
  if (dice < 1 || dice > 20 || faces < 2 || faces > 1000 || Math.abs(modifier) > 1000) return null;
  return expression.replace("D", "d");
};

const parseDiceActions = line => {
  const actions = [];
  let hasUnsupported = false;
  for (const match of line.matchAll(DICE_EXPRESSION)) {
    const expression = match[0];
    const start = match.index;
    const end = start + expression.length;
    if (!isFormulaBoundary(line, start, end)) {
      hasUnsupported = true;
      continue;
    }
    const formula = parseDiceExpression(expression.replace(/\s+/g, ""));
    if (!formula) {
      hasUnsupported = true;
      continue;
    }
    actions.push({
      kind: "dice",
      label: localize("ARIA.specialAbilityRoll.rawLabel"),
      formula,
      position: start,
    });
  }
  return { actions, hasUnsupported };
};

const hasConditionalPrefix = label => /^(?:si|lorsque|quand|en cas|au cas|pour|contre|bonus|malus|selon)\b/.test(normalizeText(label));

const parseAbilityActions = line => {
  const actions = [];
  let acceptedPercentages = 0;
  for (const match of line.matchAll(ABILITY_PERCENTAGE)) {
    const label = cleanText(match[1]);
    const score = strictInteger(match[2]);
    if (!label || hasConditionalPrefix(label)
      || match[2].startsWith("+") || match[2].startsWith("-")) continue;
    if (score === null || score < 0 || score > 100) continue;

    acceptedPercentages += 1;
    actions.push({
      kind: "ability",
      label,
      formula: "1d100",
      threshold: score,
      position: match.index + match[0].indexOf(match[1]),
    });
  }
  const percentageCount = [...line.matchAll(PERCENTAGE)].length;
  return { actions, hasUnsupported: percentageCount > acceptedPercentages };
};

const itemList = items => {
  if (!items) return [];
  if (typeof items !== "object" && typeof items !== "function") return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.contents)) return items.contents;
  if (typeof items[Symbol.iterator] === "function") return Array.from(items);
  return [];
};

const findCompetence = (target, items) => {
  const normalizedTarget = normalizeText(target);
  const matches = itemList(items).filter(item => (
    item?.type === "competence"
    && typeof item.name === "string"
    && normalizeText(target).startsWith(normalizeText(item.name))
    && (normalizedTarget.length === normalizeText(item.name).length
      || /\s/.test(normalizedTarget[normalizeText(item.name).length]))
  ));
  if (matches.length !== 1) return null;

  const item = matches[0];
  const score = strictInteger(item.system?.score);
  const bonus = strictInteger(item.system?.bonus);
  const threshold = score === null || bonus === null ? null : score + bonus;
  const itemId = item.id ?? item._id;
  if (score === null || score < 0 || score > 100 || threshold === null
    || !Number.isSafeInteger(threshold) || typeof itemId !== "string" || !itemId) return null;
  return { item, itemId, threshold };
};

const isUnresolvedSubject = line => /\b(?:victime|adversaire|oppose|opposee|opposition|cible)\b/.test(normalizeText(line));

const parseSkillAction = (line, items) => {
  const actions = [];
  let hasTargetProblem = false;
  let hasManualReason = false;
  for (const match of line.matchAll(DIRECT_CHECK)) {
    const target = cleanText(match[1] ?? "");
    if (isUnresolvedSubject(line)) {
      hasTargetProblem = true;
      hasManualReason = true;
      continue;
    }
    if (!target) {
      hasTargetProblem = true;
      continue;
    }
    const competence = findCompetence(target, items);
    if (!competence) {
      hasTargetProblem = true;
      continue;
    }
    actions.push({
      kind: "skill",
      label: competence.item.name,
      formula: "1d100",
      threshold: competence.threshold,
      itemId: competence.itemId,
      position: match.index,
    });
  }
  return { actions, hasTargetProblem, hasManualReason };
};

const makeActionId = (action, index) => JSON.stringify([
  index,
  action.kind,
  action.formula,
  action.label,
  action.threshold ?? null,
  action.itemId ?? null,
]);

/**
 * Build non-persisted roll definitions from current source HTML and live Items.
 * @param {string} description Current Actor description HTML.
 * @param {Iterable<object>} items Current Actor Items.
 * @param {Document} documentRef Browser document used for inert HTML parsing.
 * @returns {{actions: object[], notices: string[]}} Display definitions only; no Actor data is changed.
 */
export function getSpecialAbilityRolls(description, items, documentRef = globalThis.document) {
  const lines = extractSpecialAbilitySection(description, documentRef);
  const actions = [];
  const notices = new Set();
  if (!lines.length) notices.add("ARIA.specialAbilityRoll.notice.noSection");

  for (const line of lines) {
    const ability = parseAbilityActions(line);
    const dice = parseDiceActions(line);
    const skill = parseSkillAction(line, items);
    if (ability.hasUnsupported || dice.hasUnsupported) notices.add("ARIA.specialAbilityRoll.notice.manual");
    if (skill.hasTargetProblem) notices.add("ARIA.specialAbilityRoll.notice.target");
    if (skill.hasManualReason) notices.add("ARIA.specialAbilityRoll.notice.manual");
    const lineActions = [...ability.actions, ...dice.actions, ...skill.actions];
    lineActions.sort((left, right) => left.position - right.position);
    actions.push(...lineActions);
  }

  const definitions = actions.map(({ position, ...action }, index) => ({
    ...action,
    hasThreshold: action.threshold !== undefined,
    id: makeActionId(action, index),
  }));
  return {
    actions: definitions,
    notices: [...notices],
    hasPanelContent: definitions.length > 0 || (lines.length > 0 && notices.size > 0),
  };
}

const escapeHtml = value => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const localize = key => game.i18n.localize(key);

const isSafeDefinition = action => {
  if (!action || typeof action !== "object") return false;
  if (action.kind === "dice") return parseDiceExpression(action.formula) === action.formula;
  if (action.kind === "ability") {
    return action.formula === "1d100"
      && typeof action.label === "string"
      && Number.isSafeInteger(action.threshold)
      && action.threshold >= 0
      && action.threshold <= 100;
  }
  return action.kind === "skill"
    && action.formula === "1d100"
    && typeof action.label === "string"
    && Number.isSafeInteger(action.threshold)
    && typeof action.itemId === "string"
    && action.itemId.length > 0;
};

/**
 * Execute a fresh, validated definition as a private native roll.
 * @param {object} options Current Actor, action identifier, fresh definitions and runtime dependencies.
 * @returns {Promise<boolean>} Whether a roll message was created.
 * @throws {unknown} Native roll or chat errors after a localized notification.
 */
export async function executeSpecialAbilityRoll({
  actor,
  actionId,
  definitions,
  editable,
  RollClass = Roll,
  ChatMessageClass = ChatMessage,
}) {
  if (!actor?.isOwner || !editable) {
    ui.notifications.warn(localize("ARIA.specialAbilityRoll.notice.permission"));
    return false;
  }

  const action = (Array.isArray(definitions) ? definitions : [])
    .find(definition => definition?.id === actionId);
  if (!action) {
    ui.notifications.warn(localize("ARIA.specialAbilityRoll.notice.stale"));
    return false;
  }
  if (!isSafeDefinition(action)) {
    ui.notifications.warn(localize("ARIA.specialAbilityRoll.notice.manual"));
    return false;
  }

  try {
    const roll = new RollClass(action.formula);
    await roll.evaluate({ allowInteractive: false });
    const speaker = ChatMessageClass.getSpeaker({ actor });
    const escapedLabel = escapeHtml(action.label);
    const escapedFormula = escapeHtml(action.formula);
    const flavorKey = action.threshold === undefined
      ? "ARIA.specialAbilityRoll.flavor.raw"
      : "ARIA.specialAbilityRoll.flavor.reference";
    const flavor = game.i18n.format(flavorKey, {
      label: escapedLabel,
      formula: escapedFormula,
      threshold: action.threshold,
    });
    const options = typeof ChatMessageClass.applyMode === "function"
      ? { messageMode: "self" }
      : { rollMode: "selfroll" };
    await roll.toMessage({ speaker, flavor }, options);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ui.notifications.error(game.i18n.format("ARIA.specialAbilityRoll.notice.failure", {
      reason: escapeHtml(reason),
    }));
    throw error;
  }
}

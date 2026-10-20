const HAND_TEMPLATE = "systems/aria/templates/cards/ariaPlayerHand_evantail.hbs";

const CARD_MESSAGES = {
  draw: () => `<div class="card-draw flexrow"><h4 class="card-name">Pioche.</h4></div>`,
  play: card => `<div class="card-draw flexrow"><img style="width:75px" src="${card.img}"><span class="card-name">&nbsp;&nbsp;Joue ${card.name}.</span></div><span class="card-desc"><br/>${card.description}</span></div>`,
  discard: card => `<div class="card-draw flexrow"><img style="width:75px" src="${card.img}"><span class="card-name">Jette ${card.name}</span></div>`,
};

export class AriaPlayerHand extends foundry.applications.sheets.CardHandConfig {
  static DEFAULT_OPTIONS = {
    classes: ["aria", "sheet", "cardsHand", "cards-config"],
    position: { width: 400, height: 350 },
    window: { resizable: false },
    actions: {
      drawCard: function (event, target) {
        return this._onDrawCard(event, target);
      },
      play: function (event, target) {
        return this._onCardTransfer(event, target, "play");
      },
      discard: function (event, target) {
        return this._onCardTransfer(event, target, "discard");
      },
      pass: function (event, target) {
        return this._onPass(event, target);
      },
      focusCard: function (event, target) {
        return this._onFocusCard(event, target);
      },
    },
  };

  static PARTS = {
    cards: {
      ...foundry.applications.sheets.CardHandConfig.PARTS.cards,
      root: true,
      scrollable: ["ol[data-cards]"],
      template: HAND_TEMPLATE,
    },
  };

  async _onDrawCard() {
    await this.submit({ operation: { render: false } });
    const actor = await this.#getHandActor();
    if (!actor) return;

    const deck = await this.#getActorStack(actor, "getDefaultDeck", "ARIA.cards.hand.deckMissing");
    if (!deck) return;

    const [sourceCard] = deck.cards.contents;
    if (!sourceCard) return;

    const drawnCards = await this.document.draw(deck, 1, {
      updateData: { face: 1 },
      chatNotification: false,
    });
    const [drawnCard] = Array.isArray(drawnCards) ? drawnCards : [];
    if (!drawnCard) return;

    await this.#sendCardMessage(drawnCard, actor, "draw");
  }

  async _onCardTransfer(event, target, action) {
    await this.submit({ operation: { render: false } });
    const card = this.#getSelectedCard(target);
    if (!card) return;

    const actor = await this.#getHandActor();
    if (!actor) return;

    const discard = await this.#getActorStack(actor, "getDefaultDiscard", "ARIA.cards.hand.discardMissing");
    if (!discard) return;

    const transferredCard = await card.pass(discard, {
      action,
      chatNotification: false,
    });
    if (!transferredCard) return;

    await this.#sendCardMessage(transferredCard, actor, action);
  }

  async _onPass(event, target) {
    await this.submit({ operation: { render: false } });
    const row = target.closest("li[data-card-id]");
    if (!row) return this.document.passDialog();

    const card = this.document.cards.get(row.dataset.cardId);
    if (!card) {
      this.#warn("ARIA.cards.hand.cardMissing");
      return;
    }

    return this.document.playDialog(card);
  }

  _onFocusCard(event, target) {
    const row = target.closest("li.card");
    if (!row) return;
    row.classList.toggle("focusedCard");
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.rotateCards();
  }

  rotateCards() {
    const areas = this.element?.querySelectorAll?.(".cards") ?? [];
    for (const area of areas) {
      const cards = Array.from(area.children);
      cards.forEach((card, index) => {
        card.style.transform = `translateX(${index * 60}px)`;
      });
      area.style.transform = `translateX(${123 - (cards.length - 1) * 30}px)`;
    }
  }

  toggleRender() {
    if (!this.rendered) return this.render(true);
    if (this.minimized) return this.maximize();
    return this.close();
  }

  #getSelectedCard(target) {
    const row = target.closest("li[data-card-id]");
    if (!row) {
      this.#warn("ARIA.cards.hand.cardMissing");
      return null;
    }

    const card = this.document.cards.get(row.dataset.cardId);
    if (!card) this.#warn("ARIA.cards.hand.cardMissing");
    return card ?? null;
  }

  async #getHandActor() {
    const settings = game.settings.get("aria", "deckSetting");
    const actorId = settings?.actorsByHandsID?.[this.document.id];
    const actor = actorId ? game.actors.get(actorId) : null;
    if (actor) return actor;

    this.#warn("ARIA.cards.hand.actorMissing");
    return null;
  }

  async #getActorStack(actor, getter, errorKey) {
    if (typeof actor[getter] !== "function") {
      this.#warn(errorKey);
      return null;
    }

    const stack = await actor[getter]();
    if (stack?.cards && typeof stack.cards.get === "function" && Array.isArray(stack.cards.contents)) return stack;

    this.#warn(errorKey);
    return null;
  }

  async #sendCardMessage(card, actor, action) {
    await card.toMessage({
      author: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: CARD_MESSAGES[action](card),
    });
  }

  #warn(key) {
    ui.notifications.warn(game.i18n.localize(key));
  }
}

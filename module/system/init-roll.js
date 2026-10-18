export class AriaInitiativeRoll {
    constructor(label, formula,img){
        this._label = label;
        this._formula = '1d6+'+formula;
        this._img = img;
    }

    async roll(actor,rollType){

        const messageTemplate = "systems/aria/templates/chat/initiative-card.hbs";

        let r = new Roll(this._formula);
        await r.evaluate();

        const calc = r.result;
        const mod = (r.terms.length > 1);

        const result = r.total;

        this._isFumble = (result == 0);

        let templateContextData = {
            actor: actor,
            label: this._label,
            img: this._img,
            text: "",
            isFumble:this._isFumble,
            formula: this._formula,
            result: result,
            calc:calc,
            mod:mod,
        };


        let chatData = {
            author: game.user.id,
            speaker: ChatMessage.getSpeaker({actor: actor}),
            roll: r,
            rolls: [r],
            content: await renderTemplate(messageTemplate,templateContextData),
            sound: CONFIG.sounds.dice
        };

        switch (rollType) {
            case 'PUBLIC' :
                await game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.PUBLIC);
                chatData = await ChatMessage.applyRollMode(chatData, CONST.DICE_ROLL_MODES.PUBLIC);
                break;
            case 'BLIND' :
                await game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
                chatData = await ChatMessage.applyRollMode(chatData, CONST.DICE_ROLL_MODES.BLIND);
                break;
            case 'SELF' :
                await game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.SELF);
                chatData = await ChatMessage.applyRollMode(chatData, CONST.DICE_ROLL_MODES.SELF);
                break;
            case 'PRIVATE' :
                await game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.PRIVATE);
                chatData = await ChatMessage.applyRollMode(chatData, CONST.DICE_ROLL_MODES.PRIVATE);
                break;
        }
      
        ChatMessage.create(chatData);
    }


}
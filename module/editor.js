const ARIA_STYLESHEET = "/systems/aria/css/aria_TinyMCE.css";
const ARIA_INSERTS_ACTION = "aria-editor-inserts";

const ARIA_PRESETS = [
    { action: "aria-insert-info", title: "Info", classes: "aria-info" },
    { action: "aria-insert-texte", title: "Texte", classes: "aria-block aria-texte" },
    { action: "aria-insert-regle", title: "Règle", classes: "aria-block aria-regle" },
    { action: "aria-insert-point-cle", title: "Point clé", classes: "aria-block aria-point-cle" },
    { action: "aria-insert-secret", title: "Secret", classes: "secret aria-block aria-secret" },
    { action: "aria-insert-quete-principale", title: "Quête principale", classes: "aria-block aria-quete-principale" },
    { action: "aria-insert-quete-parallele", title: "Quête parallèle", classes: "aria-block aria-quete-parallele" },
    { action: "aria-insert-quete-personnelle", title: "Quête personnelle", classes: "aria-block aria-quete-personnelle" },
    { action: "aria-insert-quete-principale-fin", title: "Quête principale fin", classes: "aria-block aria-quete-principale-fin" },
    { action: "aria-insert-quete-parallele-fin", title: "Quête parallèle fin", classes: "aria-block aria-quete-parallele-fin" },
    { action: "aria-insert-quete-personnelle-fin", title: "Quête personnelle fin", classes: "aria-block aria-quete-personnelle-fin" },
    { action: "aria-insert-quete-resolue", title: "Quête résolue", classes: "aria-block aria-quete-resolue" },
    { action: "aria-insert-quete-exception", title: "Quête Personnage Exception", classes: "aria-block aria-quete-exception" },
    { action: "aria-insert-quete-alchimiste", title: "Quête Alchimiste", classes: "aria-block aria-quete-alchimiste" },
    { action: "aria-insert-quete-magicien", title: "Quête Magicien", classes: "aria-block aria-quete-magicien" },
    { action: "aria-insert-quete-noble", title: "Quête Noble", classes: "aria-block aria-quete-noble" },
    { action: "aria-insert-quete-combattant", title: "Quête Combattant", classes: "aria-block aria-quete-combattant" },
    { action: "aria-insert-quete-ennemi", title: "Quête Dieu Ennemi", classes: "aria-block aria-quete-ennemi" },
];

const createProseMirrorInsertGroup = () => ({
    action: ARIA_INSERTS_ACTION,
    title: "Aria",
    children: ARIA_PRESETS.map(({ action, title, classes }) => ({
        action,
        title,
        html: `<section class="${classes}"><selection></selection></section>`,
    })),
});

const createTinyMceStyleGroup = () => ({
    title: "Aria",
    items: ARIA_PRESETS.map(({ title, classes }) => ({
        title,
        block: "section",
        classes,
        wrapper: true,
    })),
});

export const getEditorEngine = () => {
    const config = globalThis.CONFIG ?? {};
    if (Array.isArray(config.TextEditor?.inserts)) {
        return "prosemirror";
    }
    return config.TinyMCE ? "tinymce" : "prosemirror";
};

export const registerAriaEditorOptions = () => {
    const config = globalThis.CONFIG ?? {};
    const inserts = config.TextEditor?.inserts;
    if (Array.isArray(inserts)) {
        if (!inserts.some(insert => insert.action === ARIA_INSERTS_ACTION)) {
            inserts.push(createProseMirrorInsertGroup());
        }
        return;
    }

    const tinyMce = config.TinyMCE;
    if (!tinyMce) {
        return;
    }

    const contentCss = tinyMce.content_css ?? (tinyMce.content_css = []);
    if (!contentCss.includes(ARIA_STYLESHEET)) {
        contentCss.push(ARIA_STYLESHEET);
    }

    const styleFormats = tinyMce.style_formats ?? (tinyMce.style_formats = []);
    if (!styleFormats.some(format => format.title === "Aria")) {
        styleFormats.push(createTinyMceStyleGroup());
    }
};

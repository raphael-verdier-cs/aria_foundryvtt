const normalizeDocuments = content => {
    const documents = Array.isArray(content) ? content : [content];
    if (documents.length === 0) {
        throw new TypeError("Import data must contain at least one document.");
    }
    for (const document of documents) {
        if (typeof document !== "object" || document === null || Array.isArray(document)) {
            throw new TypeError("Each imported document must be a JSON object.");
        }
    }
    return documents;
};

export class DataLoader {

    /**
     * Loads JSON data from a filepath
     * @param filepath
     * @returns {Promise<any>}
     */
    static async loadJson(filepath) {
        const response = await fetch(filepath);
        if (!response.ok) {
            throw new Error(`Failed to load import data from "${filepath}" (HTTP ${response.status}).`);
        }
        return await response.json();
    }

    /**
     * Get a pack from a packName
     * @param packName
     */
    static findPack(packName) {
        return game.packs.find(pack => pack.collection === `${System.name}.${packName}`);
    }

    /**
     * Clears data from a given pack
     * @param pack
     * @returns {Promise<true>}
     */
    static async clearPack(pack) {
        try {
            const packItems = await pack.getDocuments();
            for (const item of packItems) {
                await item.delete();
            }
        } catch (cause) {
            throw new Error(`Failed to clear compendium pack "${pack.collection}".`, { cause });
        }
        return true;
    }

    /**
     * Loads data from a JSON file into a compendium pack.
     * @param packName
     * @returns {Promise<void>}
     */
    static async loadData(packName) {
        console.info(`Importing ${packName}...`);
        let pack;
        let wasLocked;
        let restoreLock = false;
        let importError;

        try {
            pack = this.findPack(packName);
            if (!pack) {
                throw new Error(`Compendium pack "${packName}" was not found.`);
            }

            const documentClasses = { Item, Actor };
            const DocumentClass = documentClasses[pack.documentName];
            if (!DocumentClass) {
                throw new TypeError(`Unsupported compendium document type "${pack.documentName}".`);
            }

            const filepath = `${System.dataPath}/${packName}.json`;
            const documents = normalizeDocuments(await this.loadJson(filepath));
            for (const documentData of documents) {
                new DocumentClass(documentData).validate({ strict: true });
            }
            wasLocked = pack.locked;
            if (wasLocked) {
                restoreLock = true;
                await pack.configure({ locked: false });
            }
            await this.clearPack(pack);
            await DocumentClass.createDocuments(documents, { pack: pack.collection });
        } catch (error) {
            importError = error;
            globalThis.ui.notifications.error(
                `Unable to import data into compendium "${packName}": ${error.message}`,
            );
            throw error;
        } finally {
            if (restoreLock) {
                try {
                    await pack.configure({ locked: wasLocked });
                } catch (restoreError) {
                    globalThis.ui.notifications.error(
                        `Unable to restore the lock state for compendium "${packName}": ${restoreError.message}`,
                    );
                    if (importError) {
                        throw new AggregateError(
                            [importError, restoreError],
                            `Import failed and compendium "${packName}" could not be relocked.`,
                        );
                    }
                    throw restoreError;
                }
            }
        }
        console.info(`${packName} imported.`);
    }
}

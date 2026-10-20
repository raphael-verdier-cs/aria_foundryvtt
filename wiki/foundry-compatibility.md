# Compatibilite Foundry VTT

## Version cible

La version stable la plus recente consultee le 18 octobre 2026 est
[Foundry VTT 14.369 (Stable 11)](https://foundryvtt.com/releases/14.369).
Consulter aussi le [catalogue des versions](https://foundryvtt.com/releases/).

Les tests automatises du systeme ne remplacent pas une verification dans
Foundry. L'interface de main a ete verifiee dans Foundry 14.369 : rendu en
eventail, focus, pioche, jeu, defausse, dialogues de transfert et notifications
uniques apres succes. Les actions annulees ou echouees ne publient pas de
message de succes. Le glisser-deposer complet entre fenetres et la certification
sur Foundry 13.345 restent a effectuer. Le minimum declare dans le manifeste
reste 13.345 ; la documentation API de cette branche ne certifie pas a elle
seule la version exacte 13.345.

Apres les essais dans une instance sous licence, le manifeste declare
`verified: 14.369` sans relever le minimum `13.345`. Les fiches et les nouveaux
jets de reference ont aussi ete controles dans cette instance ; cela ne
remplace pas les essais de votre monde ni ceux des modules optionnels.

## Remplacements et comportement conserve

- Les messages de jet utilisent `author` et `rolls` au lieu des champs retires
  `user` et `CONST.CHAT_MESSAGE_STYLES.ROLL`.
- Le transfert depuis une carte utilise `Cards.playDialog(carte)` pour garder
  la carte selectionnee ; le transfert depuis l'en-tete conserve
  `Cards.passDialog()` pour toute la main.
- La main des joueurs utilise `foundry.applications.sheets.CardHandConfig`
  avec le template Aria en eventail et la liste native `ol[data-cards]` pour
  conserver les identifiants des cartes incorporees et le glisser-deposer.
  Ses actions Aria de pioche, jeu et defausse suppriment la notification native
  uniquement lorsqu'elles publient deja leur propre message ; les dialogues
  natifs conservent leur notification.
- Les compendiums utilisent les API de documents actuelles et la configuration
  explicite de leur verrouillage. Les erreurs d'import sont signalees et les
  donnees sources sont controlees avant toute suppression.
- Sur Foundry 14, les 18 styles nommes Aria sont disponibles dans le menu
  **Insertion > Aria** de ProseMirror, en remplacement de **Format > Aria**
  dans TinyMCE. Le contenu selectionne est enveloppe dans le meme element
  `section` avec les memes classes CSS, y compris la classe `secret`.
- Sur les versions precedentes qui ne proposent pas les insertions ProseMirror,
  la configuration TinyMCE existante est conservee de facon conditionnelle.
- Le systeme ne lance aucune nouvelle migration des donnees de monde.

Les styles existants ne sont pas reecrits. Il reste indispensable de verifier
l'ouverture, la modification, la sauvegarde et la reouverture de documents
contenant ces styles sur une copie du monde.

## Sauvegarde et mise a jour

1. Arreter Foundry et sauvegarder l'ensemble du dossier de donnees utilisateur,
   ainsi que la version precedente du logiciel et du systeme Aria.
2. Conserver l'installation et les sauvegardes d'origine sans modification.
3. Installer Foundry 14 separement et travailler sur une copie des donnees.
4. Mettre a jour Aria dans cette installation de test avant d'ouvrir le monde.
5. Tester les parcours ci-dessous avant d'utiliser le monde en partie.

Une migration de monde par Foundry n'est pas une operation reversible en
reinstallant simplement l'ancienne version du systeme. Pour revenir en arriere,
arreter Foundry, restaurer le logiciel precedent ET la sauvegarde complete des
donnees realisee avant la migration. Ne pas ouvrir un monde migre avec une
ancienne version de Foundry.

## Verification manuelle avant une partie

- Creer et ouvrir chaque type d'acteur et d'objet ; modifier et sauvegarder
  leurs champs, descriptions enrichies et images.
- Ouvrir une fiche existante et verifier caracteristiques, competences,
  inventaire, protections, points de vie et monnaie.
- Dans une fiche de personnage, modifier puis sauvegarder une description avec
  une section **Compétences spéciales** ; verifier que les contrôles de jet
  restent séparés de l'editeur, ne changent ni la description ni les Items, et
  que leurs jets privés n'interprètent pas automatiquement seuils, conditions
  ou effets.
- Glisser les objets et competences des compendiums vers une fiche ; verifier
  l'edition, la suppression et les valeurs conservees apres rechargement.
- Effectuer les jets de caracteristique, competence, attaque et degats ;
  verifier les reussites, echecs, critiques et messages de chat.
- Tester les modes de jet public, prive et aveugle avec un MJ et un joueur.
- Creer/utiliser une macro de la barre de raccourcis.
- Piocher, distribuer et jouer les cartes ; verifier les mains et messages.
- Tester Dice So Nice avec et sans le module installe.
- Recharger le monde et verifier la conservation des donnees.
- Dans un journal et dans les descriptions d'acteur et d'objet, appliquer chaque
  style du menu Aria a une selection enrichie ; verifier que liens, titres et
  contenu restent presents apres sauvegarde et reouverture. Verifier aussi le
  comportement du style Secret avec un MJ et un joueur.
- Verifier l'absence d'erreurs dans la console du navigateur.

## References de migration

- [Version 14 Stable 1 et precautions de mise a jour](https://foundryvtt.com/releases/14.359)
- [Version 14 Prototype 1 : retrait de TinyMCE](https://foundryvtt.com/releases/14.349)
- [Depreciations retirees dans Foundry 14](https://github.com/foundryvtt/foundryvtt/issues/13436)
- [API Foundry 14](https://foundryvtt.com/api/v14/)
- [Insertions ProseMirror prises en charge](https://foundryvtt.com/api/v14/variables/CONFIG.TextEditor.html)

Les autres fiches ApplicationV1 ne sont pas remplacees uniquement pour adopter
ApplicationV2 : une telle reecriture n'est pas necessaire a la compatibilite
de base et changerait sensiblement leur interface. La main est l'exception
ciblee, car le rendu natif V2 avait remplace son interface en eventail.

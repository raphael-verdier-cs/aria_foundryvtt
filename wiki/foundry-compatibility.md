# Compatibilite Foundry VTT

## Version cible

La version stable la plus recente consultee le 18 octobre 2026 est
[Foundry VTT 14.369 (Stable 11)](https://foundryvtt.com/releases/14.369).
Consulter aussi le [catalogue des versions](https://foundryvtt.com/releases/).

Les tests automatises du systeme ne remplacent pas une verification dans
Foundry. Aucun serveur Foundry sous licence n'etait disponible pour cette
mise a jour : la verification en conditions reelles reste a effectuer.
Le minimum et la derniere version verifiee dans le manifeste restent donc
13.345 : cette modification cible Foundry 14.369 sans annoncer une verification
en conditions reelles qui n'a pas eu lieu.

## Remplacements et comportement conserve

- Les messages de jet utilisent `author` et `rolls` au lieu des champs retires
  `user` et `CONST.CHAT_MESSAGE_STYLES.ROLL`.
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

Les anciennes fiches ApplicationV1 ne sont pas remplacees uniquement pour
adopter ApplicationV2 : une telle reecriture n'est pas necessaire a la
compatibilite de base et changerait sensiblement l'interface.

# Aria - Game of Roles

![aria.jpg](/logos/aria.jpg)

Jeu de la série Game of Rôles imaginée par [FibreTigre](https://www.fibretigre.com/).
Popularisé sur Twitch / Youtube, lien :  [Saison 1](https://www.youtube.com/playlist?list=PLTJVtKcBdMNWKJxAnpSf1fj4CUp49148Z), [Saison 2](https://www.youtube.com/playlist?list=PLTJVtKcBdMNV9tpuHa_YRKlsMspnXFEbx), [Saison 3](https://www.youtube.com/playlist?list=PL4ILyHtnURFrTkuFoje8KhBIoV63ATuwe) et [son final](https://www.youtube.com/playlist?list=PLTJVtKcBdMNW2XAbHVhU1FWR9e_4N8vsm).
Jeu publié chez [Elder Craft](https://www.elder-craft.com/).<br><br>
Developeur du système : Dilomos (Jonathan Bernard) Contacter moi sur les Discord : La Fonderie / Elder-Craft (communauté) / FibreTigre.<br>
**em@il** : dilomos@gmail.com<br>
**Suggestions et bugs** : [https://gitreports.com/issue/Dilomos/aria_foundryvtt](https://gitreports.com/issue/Dilomos/aria_foundryvtt).  

Manifest : [https://raw.githubusercontent.com/Dilomos/aria_foundryvtt/main/system.json](https://raw.githubusercontent.com/Dilomos/aria_foundryvtt/main/system.json).<br>
Projet : [https://github.com/Dilomos/aria_foundryvtt](https://github.com/Dilomos/aria_foundryvtt).

## Compatibilite et mise a jour

Consulter le [guide de compatibilite Foundry](wiki/foundry-compatibility.md)
pour la version cible, les precautions de sauvegarde, le retour arriere et les
verifications a effectuer avant une partie. La validation automatisee ne
constitue pas une verification dans un serveur Foundry sous licence.

## Tests et developpement

Les tests utilisent le lanceur natif de Node.js 24.20.0, sans dependance de test.

Sur les fiches de personnage, les jets de reference des **Competences speciales**
sont derives de la description actuelle et restent distincts de l'editeur :
les des littéraux sont des jets bruts, les seuils sont indicatifs et les
conditions ou effets restent a interpreter manuellement. Les jets sont prives
par defaut. Voir le [guide de compatibilite](wiki/foundry-compatibility.md)
pour les verifications manuelles.

```sh
npm test
npm run test:coverage
```

Pour compiler les styles avec les outils existants :

```sh
npm ci
npm run compile
```

Le workflow GitHub Actions execute les tests avec couverture et la compilation
des styles. Les doubles de test isolent les API Foundry et le navigateur ; ils
ne remplacent pas les [verifications manuelles](wiki/foundry-compatibility.md).
La couverture impose 100 % des lignes, branches et fonctions des modules
JavaScript du systeme. Une erreur Sass fait echouer la compilation.

Les journaux et les editeurs conservent un fond blanc avec un texte sombre,
y compris lorsque l'interface Foundry utilise le theme sombre. Les tests de
styles verifient un contraste minimal de 4,5:1 pour les titres, tableaux et encadres,
ainsi qu'un corps de texte de 16 px avec un interligne de 1,5.
Les titres natifs des pages restent lisibles pour tous les niveaux du plan,
y compris les sections et sous-sections en theme sombre.
Les mots longs et les liens vers les documents peuvent revenir a la ligne
pour conserver des tableaux et une navigation lisibles dans une fenetre etroite.

Si le coeur vous en dit n'hésitez pas à faire un don : [<img src="https://www.paypalobjects.com/fr_FR/FR/i/btn/btn_donate_LG.gif">](https://www.paypal.com/donate?hosted_button_id=D3PP8J9JFUVFG)

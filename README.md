# SonorStudio

Un studio de production musicale dans le navigateur, avec le workflow de FL Studio : Channel Rack, Piano Roll, Playlist, Mixer et Browser. On ne télécharge rien et on n'installe rien : on ouvre la page, on appuie sur Espace, ça joue.

## Lancer le projet

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests du séquenceur et du modèle
npm run build    # typecheck + build de prod dans dist/
```

Pile technique : Vite, React 19, TypeScript, Zustand avec Immer pour l'état et l'undo/redo, Web Audio API. Il n'y a ni backend ni dépendance audio externe.

## Ce qui marche aujourd'hui

- **Channel Rack** : step sequencer par groupes de 4. On peint les steps à la souris, le clic droit efface. Chaque channel a mute/solo, volume, pan et un numéro de piste mixer. Un channel avec des notes mélodiques affiche un aperçu du piano roll. Le clic droit sur un nom ouvre le menu : remplir tous les 2, 4 ou 8 steps, cloner, renommer, supprimer.
- **Piano Roll** : crayon, pinceau, gomme et sélection. On peut déplacer, redimensionner et dupliquer les notes (Maj + glisser). Il y a les ghost notes des autres channels, une lane de vélocité, le snap et le zoom (Ctrl + molette). Raccourcis : Ctrl+A, C, X, V, B, D, flèches pour transposer ou déplacer.
- **Playlist** : clips de patterns posés sur 32 pistes. On peut les peindre, les déplacer, les redimensionner ou les rogner par la gauche. Elle gère aussi la sélection, Ctrl+B pour dupliquer, la position de départ via la règle, le suivi de lecture et le mute par piste.
- **Mixer** : master et 24 inserts, avec fader, pan, vumètres stéréo, mute/solo et 8 slots d'effets par piste. Effets disponibles : EQ, Filter, Drive, Compressor, Delay synchronisé au tempo, Reverb, Limiter.
- **Instruments** : un sampler (pitch, cut itself) et un synthé à 3 oscillateurs avec filtre, enveloppe et 8 presets.
- **Sons** : 27 sons de batterie, de 808 et d'effets, tous synthétisés au chargement. Aucun sample n'est livré avec l'app.
- **Ses propres sons** : la section « My sounds » du Browser accepte des fichiers audio (WAV, MP3, OGG, FLAC, AIFF, M4A… tout ce que le navigateur sait décoder), un dossier entier ou un `.zip` de kit, par le bouton Import sounds ou en les déposant sur le Browser. Les sous-dossiers d'un dossier ou d'un zip deviennent des dossiers de la bibliothèque. Déposer des fichiers sur le Channel Rack crée directement un channel par son, dans l'ordre du dépôt (sur une ligne précise : elle prend le premier fichier), en une seule étape d'annulation. Les sons sont gardés dans le navigateur (IndexedDB), identifiés par l'empreinte de leur contenu, donc réimporter un fichier ne le duplique jamais. Un `.sonor.zip` déposé comme sons apporte ses sons sous leurs vrais noms. Clic droit sur un son : renommer, supprimer. Limites : 25 Mo par fichier (8 Mo pour les formats compressés comme le MP3) et 3 minutes.
- **Transport** : modes Pattern et Song (touche L), tempo modifiable par glisser, molette ou double-clic, swing.
- **Clavier d'ordinateur en piano** : rangées Z…M et Q…P, par position physique des touches, donc ça marche aussi en AZERTY. Entrée MIDI disponible via Web MIDI.
- **Sauvegarde et export** : sauvegarde automatique dans le navigateur, fichier projet `.sonor.json`, export WAV du morceau rendu hors-ligne. « Export project with sounds » produit un `.sonor.zip` qui embarque les sons importés que le projet utilise : il s'ouvre partout avec « Open project file… », qui remet les sons dans la bibliothèque avant de charger le projet. Un son supprimé de la bibliothèque laisse son channel en place, muet, avec « Sample missing » dans le rack.
- **Undo/redo** : Ctrl+Z et Ctrl+Y.
- **Fenêtres flottantes** façon FL : F5 Playlist, F6 Channel Rack, F7 Piano Roll, F8 Browser, F9 Mixer.

## Organisation du code

```
src/core/    modèle du projet (types, temps, helpers) : pur, testé
src/audio/   moteur : sons synthétisés, voix, graphe mixer + effets, séquenceur, export WAV
src/state/   store Zustand, actions, projet de démo, sauvegarde
src/ui/      fenêtres, contrôles (knob, fader, LED), raccourcis, menus
```

Le séquenceur utilise le principe du « lookahead » : un timer qui tourne dans un Worker programme les notes 120 ms à l'avance sur l'horloge audio. Le timing reste donc précis, même quand l'onglet passe en arrière-plan.

## Formats de fichiers

- `.sonor.json` : le projet seul. Les channels référencent les sons par id (`kick-808` pour un son intégré, `u_` + empreinte SHA-256 pour un son importé) et gardent le nom du sample importé, pour pouvoir dire lequel manque.
- `.sonor.zip` : `project.json` (le même JSON), `sounds/<id>.<ext>` (les fichiers importés tels quels, pas de PCM) et `sounds.json` qui donne leur nom et leur dossier. Les sons intégrés ne sont jamais embarqués, ils sont resynthétisés à l'ouverture.
- La bibliothèque de sons vit dans IndexedDB (base `sonorstudio`, store `samples`), le projet courant et la disposition des fenêtres dans localStorage.

## Approche : on reproduit le fonctionnement, pas le logiciel

SonorStudio reproduit **la façon de travailler** de FL Studio, observée en l'utilisant et en lisant son manuel, avec un design et un code entièrement nouveaux.

- On s'appuie sur ce que le droit autorise : une personne qui a une licence peut observer, étudier et tester le logiciel (art. L122-6-1 III du CPI). Et selon l'arrêt SAS Institute (CJUE, 2012), les fonctionnalités d'un logiciel ne sont pas protégées.
- **Pas de décompilation de FL Studio.** En France, elle n'est permise que pour l'interopérabilité, jamais pour créer un logiciel dont l'expression est similaire (art. L122-6-1 IV du CPI). L'EULA de FL Studio l'interdit aussi (article 7 : « reverse engineer, decompile, disassemble »), tout comme le disclaimer de l'outil REA.
- **Aucun asset d'Image-Line** : ni samples, ni presets, ni skins, ni icônes, ni textes du manuel. L'EULA range les sons, loops, samples et patches fournis dans les « Demo Songs », et interdit de les reprendre dans une banque de sons ou tout autre produit commercial, même « re-synthesized or otherwise edited ». Les sons de SonorStudio sont donc tous synthétisés par l'app.
- **Pas la marque « FL »** dans le nom ni dans le marketing.

## Pistes pour la suite

- Clips audio dans la playlist (poser un son importé directement sur une piste), enregistrement micro
- Clips d'automation (volume, cutoff…)
- Import des projets `.flp` en lecture : le format est documenté publiquement, notamment par le projet PyFLP
- Comptes, sauvegarde cloud et partage de projets par lien
- Mixer : sends, routing entre inserts, plus d'effets

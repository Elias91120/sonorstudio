# Landing, démo UK Drill et vidéo : plan en jalons

Objectif : quand on arrive sur sonorstudio.vercel.app, une landing explique SonorStudio (gratuit, bêta ouverte) avec une
vidéo de démo ; le bouton « Accéder à la bêta » ouvre le studio, qui charge une démo UK Drill tirée d'un vrai fichier
FL Studio (patterns de PAV, kit GASSED de Producergrind).

On fait les jalons dans l'ordre, un par un.

## J1. Import des fichiers `.flp`

« Open project file… » et le glisser-déposer acceptent un `.flp`. On lit le format publié (documenté par PyFLP) :
tempo, channels (nom, sample référencé, volume, pan, piste mixer), patterns et notes, playlist, inserts du mixer
(volume, pan, et les effets natifs qu'on sait traduire : limiter, EQ, soft clipper, compresseur, reverb, delay).
Les plugins tiers deviennent des channels vides, signalés.

**Fini quand** le `.flp` de PAV s'ouvre avec 9 channels, 2 patterns, 148 BPM, les notes de 808 au bon pitch, les
volumes et le routage mixer ; tests vitest sur un `.flp` fabriqué dans le test.

## J2. Le kit « s'accorde » au projet

Un `.flp` référence ses samples par chemin. Un channel dont le sample n'est pas dans la bibliothèque garde le nom du
fichier attendu, joue un son intégré de remplacement, et se relie tout seul au vrai son dès qu'un son de même nom est
importé (fichier, dossier ou zip du kit).

**Fini quand** le projet PAV ouvert sans le kit joue avec les sons intégrés et dit lesquels manquent, et que déposer le
zip GASSED fait basculer les 9 channels sur les vrais sons, sans rien d'autre à faire.

## J3. La démo UK Drill remplace l'ancienne

La démo par défaut devient « UK Drill — patterns by PAV » : les deux patterns arrangés en 16 mesures dans la playlist,
crédits dans le projet, et un bandeau qui propose de récupérer le kit gratuit GASSED pour entendre les vrais sons.

**Fini quand** un nouveau visiteur arrive sur la démo UK Drill, Espace la joue, et le bandeau mène au kit.

## J4. La landing

`/` devient la landing, le studio passe sur `/studio/`. Sections : promesse et bouton « Accéder à la bêta », vidéo,
ce qu'on peut faire (rack, piano roll, playlist, mixer, import de sons et de `.flp`), « gratuit, rien à installer »,
crédits. Même identité visuelle que l'app (ardoise, verre fumé, Instrument Sans), légère et rapide.

**Fini quand** la landing est propre sur ordinateur et téléphone et que le bouton ouvre le studio.

## J5. La vidéo de démo

Motion design (Remotion) entrecoupé de vraies captures du studio : on explique, pause, et l'instru se lance dans le
studio (rack, piano roll, playlist, mixer qui bougent avec le son). Son : le beat rendu par l'app avec le kit.

**Fini quand** la vidéo (MP4 léger, ~45 s) tourne dans la landing, avec le son, et que les coupes tombent sur le temps.

## J6. Vérification et mise en ligne

Build, tests, essai dans le navigateur, commit. Le push sur `main` déclenche le déploiement Vercel : on le fait après
ton accord.

## Crédits et droits

- Patterns : PAV Music Production, gratuits avec crédit obligatoire (« Drum Pattern designed by PAV Music
  Production », lien YouTube https://www.youtube.com/c/pavmusicproduction).
- Kit : GASSED UK Drill Drum Kit, Producergrind, gratuit (https://producergrind.com/products/gassed-free-uk-drill-drum-kit).
  Les samples bruts ne sont pas embarqués dans l'app (redistribuer un kit est en général interdit, même gratuit) :
  l'app renvoie vers le téléchargement officiel. La vidéo, elle, contient le beat fait avec le kit, ce qui est l'usage
  prévu d'un kit libre de droits.

# Fantasy-OS Dice

Fantasy-OS Dice verbindet freigegebene Charaktere von fantasy-os.com mit Foundry VTT. Das Modul ergänzt einen kompakten Würfelbecher, dessen Ergebnisse über Foundrys eigene Würfel-API im Chat landen.

## Funktionen

- Schnellwürfel für W4, W6, W8, W10, W12, W20 und W100
- Frei wählbare Würfelanzahl und Modifikator
- Eigene Foundry-Formeln wie `2d20kh + 4`
- Öffentliche, private, verdeckte und nur selbst sichtbare Würfe
- Character-Synchronisation über den öffentlichen Fantasy-OS-Freigabelink
- Attributproben für STR, DEX, CON, WIL, INT und SOC
- Deutsche und englische Oberfläche
- Systemunabhängig und für Foundry VTT 13/14 ausgelegt

## Manuelle Installation

1. Lege im Foundry-Benutzerdatenverzeichnis unter `Data/modules/` einen Ordner namens `fantasy-os-dice` an.
2. Kopiere den gesamten Inhalt dieses Projekts in den neuen Ordner. `module.json` muss direkt in `Data/modules/fantasy-os-dice/` liegen.
3. Starte Foundry VTT neu.
4. Öffne deine Welt, wähle **Module verwalten**, aktiviere **Fantasy-OS Dice** und lade die Welt neu.

Danach erscheint unten rechts neben der Foundry-Seitenleiste die Schaltfläche **Würfeln**.

## Charakter verbinden

1. Öffne den Charakter auf fantasy-os.com und bearbeite ihn.
2. Öffne **Öffentlicher Charakterbogen-Link** und kopiere den angezeigten Link.
3. Öffne in Foundry den Fantasy-OS-Würfelbecher.
4. Füge den Link unter **Charakter-Anbindung** ein und wähle **Verbinden**.

Das Modul lädt den Charakter beim nächsten Start automatisch erneut. Über die sechs Attributfelder würfelst du `1d20` plus Grundwert, Bonus und Modifikator des synchronisierten Charakters. Behandle den Freigabelink wie ein Kennwort, weil er den lesenden Zugriff auf den freigegebenen Charakter ermöglicht.

## Modul-API

Das Modul stellt nach dem Foundry-Hook `ready` eine kleine API bereit:

```js
const dice = game.modules.get("fantasy-os-dice").api;

dice.open();
await dice.roll("1d20 + 5", "public");
await dice.connectCharacter("https://fantasy-os.com/character/123?key=…");
await dice.rollCharacterAttribute("str", "public");

const character = dice.getCharacter();
```

Erlaubte Sichtbarkeiten sind `public`, `gm`, `blind` und `self`. `syncCharacter()` aktualisiert die Daten, während `disconnectCharacter()` den gespeicherten Link aus den clientbezogenen Foundry-Einstellungen entfernt.

## Portal-API

Fantasy-OS stellt den freigegebenen Charakter über einen versionierten Endpunkt bereit:

```http
GET /api/foundry/v1/characters/{characterId}
Authorization: Bearer {shareKey}
Accept: application/json
```

Die Antwort enthält `apiVersion`, `character` und `sourceUpdatedAt`. Der Endpunkt liefert weder die Besitzer-ID noch den Freigabeschlüssel zurück und setzt `Cache-Control: private, no-store`.

## Entwicklung

Die lokalen Prüfungen benötigen nur Node.js und keine zusätzlichen Pakete:

```sh
npm run check
```

Ein echter Integrationstest muss innerhalb einer Foundry-Welt erfolgen, weil Foundrys Browser-APIs außerhalb der Anwendung nicht verfügbar sind.

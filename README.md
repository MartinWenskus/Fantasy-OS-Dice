# Fantasy-OS Dice

Fantasy-OS Dice verbindet freigegebene Charaktere von fantasy-os.com mit Foundry VTT. Version 0.4.3 nutzt die native
Chat-Sichtbarkeit von Foundry VTT 14 und unterstützt weiterhin V13. Mit einem Spiel-Verbindungslink landen Würfe und
Aktionen im Foundry-Chat und im FantasyOS-Spielverlauf. Ressourcen und Anwendungen werden im gemeinsamen Spielzustand
gespeichert.

## Funktionen

- Schnellwürfel für W4, W6, W8, W10, W12, W20 und W100
- Frei wählbare Würfelanzahl und Modifikator
- Eigene Foundry-Formeln wie `2d20kh + 4`
- Öffentliche, private, verdeckte und nur selbst sichtbare Würfe
- Spielverbindung pro Charakter und Spiel mit widerrufbarem privatem Link
- Gemeinsamer Spielzustand und protokollierte Aktionen; sichere Wiederholung bei Verbindungsabbrüchen
- Alternativ Character-Synchronisation über den öffentlichen Fantasy-OS-Freigabelink
- Attributproben für STR, DEX, CON, WIL, INT und SOC
- Initiative würfeln: `1d20 + Initiativewert` per Klick auf den Initiative-Button
- Alle 16 Fertigkeitsproben und bis zu vier eigene Fertigkeiten
- Zauber wirken mit Mana-Abzug und Chatmeldung; separate Schadens-/Heilwürfe inklusive Zauberkraft
- Volks-, Klassen-, Gegenstands- und eigene Aktionen mit konfigurierbaren Kosten/Anwendungen
- LP, Mana, VP und AP bearbeiten; Anzeige von Maximum, Zauberkraft, Zauber-SG, Bewegung und Initiative
- Entscheidungswürfel, Ergebnistabellen und automatische Folgewürfe
- Kurze/lange Rast sowie Rücksetzen pro Sitzung
- Ausrüstung und Charakter-Notizen
- Gold- und Papierfarben mit der originalen FantasyOS-Papiertextur (auch in dunklen Foundry-Welten)
- Deutsche und englische Oberfläche
- Systemunabhängig und für Foundry VTT 13/14 ausgelegt

## Installation über Foundry

Öffne in Foundrys Setup **Zusatzmodule → Modul installieren**, füge die folgende URL bei **Manifest-URL** ein und wähle
**Installieren**.

```text
https://raw.githubusercontent.com/MartinWenskus/Fantasy-OS-Dice/refs/heads/main/module.json
```

Öffne anschließend deine Welt und aktiviere **Fantasy-OS Dice** unter **Spieleinstellungen → Module verwalten**.
Nach dem Neuladen erscheint die Schaltfläche **FOS**. Weitere Versionen findest du im Setup über die Modul-Updates.

Alternativ kannst du das [Installationspaket 0.4.3](https://raw.githubusercontent.com/MartinWenskus/Fantasy-OS-Dice/refs/heads/main/dist/fantasy-os-dice-0.4.3.zip) herunterladen und den enthaltenen Ordner
`fantasy-os-dice` in `Data/modules/` im Foundry-Benutzerdatenordner entpacken.

## Mit einem Spiel verbinden (0.4.0)

Voraussetzung: Portal-API, Server-Zugang und Firestore-Regeln sind wie unten beschrieben eingerichtet.

1. Öffne das gewünschte Spiel in FantasyOS und füge deinen Charakter zur Spielgruppe hinzu.
2. Wähle unter **Foundry verbinden** deinen Charakter und **Verbindungslink erzeugen**. Den Link erstellt der Besitzer
   des Charakters mit seinem angemeldeten Konto. Spielmitgliedschaft und Charakterbesitz werden serverseitig geprüft.
3. Kopiere den privaten Link in Foundry unter **FOS → Charakter-Anbindung → Spiel- oder Charakterlink** und wähle
   **Verbinden**.
4. Unter den Spielwerten steht nun der Name des verbundenen Spiels. Eine Aktion wird diesem Spiel und Charakter
   zugeordnet.

Der Link läuft nach 30 Tagen ab. Erneutes Erstellen ersetzt den bisherigen Schlüssel dieses Paars; **Verbindungslink
widerrufen** sperrt ihn sofort. Die Spielleitung kann Verbindungen auch über den authentifizierten DELETE-Endpunkt
widerrufen. Entfernen des Besitzers aus dem Spiel oder des Charakters aus der Gruppe sperrt die Verbindung ebenfalls.
Ohne Spiel-Verbindungslink werden keine Aktionen im Portal protokolliert.

Gespeichert werden Initiative, Attribute, Fertigkeiten, Schnell-/Wirkungs-/eigene Würfe, Zauber und Fähigkeiten,
Ressourcenänderungen, Konfigurationen, neue/entfernte Aktionen, zurückgegebene Anwendungen und Rasten. Aufklappen,
Navigation und Suchtexte sind keine Spielaktionen.

Bei einer unklaren Übertragung bleibt die Aktion in diesem Browser gespeichert. **Übertragung wiederholen** sendet
dieselbe Aktions-ID: Der Server belastet Ressourcen nur einmal. Auch nach Neuladen bleibt die ausstehende Aktion
verfügbar. Nicht durch einen neuen Wurf ersetzen. Ein bestätigter Regelverstoß, z. B. zu wenig Mana, gibt die Bedienung
ohne Verbrauch wieder frei.

Öffentliche Aktionen sind für die Spielgruppe sichtbar. **Privat an die Spielleitung** erhält Besitzer und
Portal-Spielleitung, **Nur für mich** nur der Besitzer, **Verdeckt** nur die Portal-Spielleitung. Im gemeinsamen
Spielchat steht für private Aktionen nur ein Hinweis; Details stehen im zugriffsgeschützten Spielprotokoll. Foundrys
Sichtbarkeit richtet sich separat nach den Foundry-Spieler-/GM-Konten. Ressourcen bleiben wie bisher für die Gruppe
sichtbar. Würfelergebnisse werden in Foundry erzeugt und vom Server protokolliert, nicht serverseitig neu gewürfelt.

## Nur Charakter verbinden (ohne Spielprotokoll)

1. Öffne den Charakter auf fantasy-os.com und bearbeite ihn.
2. Öffne **Öffentlicher Charakterbogen-Link** und kopiere den angezeigten Link.
3. Öffne in Foundry den Fantasy-OS-Würfelbecher.
4. Füge den Link unter **Charakter-Anbindung** ein und wähle **Verbinden**.

Das Modul lädt den Charakter beim Start automatisch erneut. Bei vorübergehenden Fehlern versucht es die Wiederverbindung bis zu zweimal erneut. Über die sechs Attributfelder würfelst du `1d20`
plus Grundwert, Bonus und Modifikator des synchronisierten Charakters. Behandle den Freigabelink wie ein Kennwort, weil
er den lesenden Zugriff auf den freigegebenen Charakter ermöglicht.

## Spielen (0.3.0)

Nach dem Verbinden steht der Spielbereich unter den Attributen bereit. Die Sichtbarkeit gilt für Würfe und
Spielaktionen.

1. **Zauber & Aktionen:** Eintrag aufklappen. **Wirken** prüft Kosten und Anwendungslimit zusammen, speichert den
   Verbrauch und erstellt eine Chatnachricht. Wirkungswürfe werden über ihre eigene Schaltfläche gewürfelt; sie ziehen
   keine weiteren Kosten ab. Zielschaden/-heilung wird nicht automatisch auf Foundry-Actors angewendet.
2. **Einstellen:** Bei unbekannten/variablen Manakosten und automatisch gefundenen Volks-/Klassenfähigkeiten zuerst eine
   Regel festlegen. `0` bedeutet manafrei, „Unbegrenzt“ deaktiviert nur das Anwendungslimit. AP werden wie im Portal
   angezeigt und manuell verwaltet.
3. Beispiel **Teleport:** Mana `0`, Unbegrenzt aus, Anwendungen `1`, Rücksetzen „Pro lange Rast“. Beispiel
   **Telepathie:** Mana `0`, Unbegrenzt an. Der Text einer Fähigkeit wird nicht automatisch als Regel interpretiert.
4. Optional einen Entscheidungswürfel wie `1d6` und Zeilen wie `1-2 = Nichts` oder `3 = Schutz (1w6)` hinterlegen. Beim
   Verwenden werden Entscheidungs- und Folgewurf gemeinsam mit der Aktion in den Chat geschrieben.
5. **Kurze Rast:** VP auffüllen; optional `Stufe d10 + KON × Stufe` auf LP oder Mana, begrenzt durch das Maximum. Nur
   Zähler für kurze Rast werden zurückgesetzt. **Lange Rast:** alle bekannten Ressourcenmaxima und Zähler für
   kurze/lange Rast. **Neue Sitzung:** ausschließlich Sitzungszähler. „Kein automatischer Reset“ bleibt erhalten.
6. **Eine Anwendung zurückgeben** korrigiert nur den Zähler. Bereits ausgegebenes Mana wird bei Bedarf über die
   Ressourcenanzeige korrigiert.

### Speicherung und Portal

Mit Spiel-Verbindungslink sind `rooms/{gameId}/state/{characterId}` und der Spielverlauf maßgeblich. Der Server
speichert Ressourcen, Zähler, Chat, Spielprotokoll und Aktionsquittung in einer Firestore-Transaktion. Bestehender
Portalverbrauch wird übernommen; ein alter lokaler Foundry-Stand wird nicht hochgeladen. Der Zustand wird beim
Verbinden, vor Spielaktionen und mit jeder bestätigten Aktion aktualisiert. Für externe Änderungen ohne eigene Aktion
**Charakter synchronisieren** verwenden.

Mit öffentlichem Charakterlink liegt der Verbrauch weiterhin in Foundry-Benutzerflags, getrennt nach Welt, Benutzer,
Portaladresse und Charakter. Dieser Link gewährt ausschließlich lesenden Portalzugriff. Mehrere Tabs desselben
Foundry-Benutzers sollten denselben Charakter nicht gleichzeitig bedienen; ausstehende Übertragungen liegen im lokalen
Browser. Spiel- und Charakterlinks liegen im Browser, getrennt nach Foundry-Welt und Benutzer. Beim ersten Start mit
0.4.3 übernimmt das Modul einen vorhandenen Link für die aktuell geöffnete Welt und den angemeldeten Benutzer.

## Modul-API

Das Modul stellt nach dem Foundry-Hook `ready` eine kleine API bereit:

```js
const dice = game.modules.get("fantasy-os-dice").api;

dice.open();
await dice.roll("1d20 + 5", "public");
await dice.connectCharacter("https://fantasy-os.com/character/123?key=…");
await dice.rollCharacterAttribute("str", "public");

const character = dice.getCharacter();
const state = dice.getGameState();
const connectedGame = dice.getGameConnection(); // id + name, ohne Schlüssel
const actions = dice.getActions();
await dice.castSpell(123); // interne Zauber-ID, mit denselben Kosten-/Limitprüfungen
```

Erlaubte Sichtbarkeiten sind `public`, `gm`, `blind` und `self`. `syncCharacter()` aktualisiert die Daten, während
`disconnectCharacter()` den gespeicherten Link für die aktuelle Foundry-Welt und den angemeldeten Benutzer entfernt.

## Entwicklung

Starte Syntaxprüfungen und Tests mit `npm run check`.

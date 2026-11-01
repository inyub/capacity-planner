# Capacity Planner

Windows-Desktop-App mit Electron, React und TypeScript. Das Projekt wurde bewusst in diesem Unterordner angelegt, damit die Planungsdokumente und gelieferten Assets im übergeordneten Ordner erhalten bleiben.

## Entwicklungsstand unter Windows ansehen

Version **0.3.0** ergänzt die lokal vorbereitete Updatefunktion aus CHAT 14. Auf ausdrücklichen Wunsch ist noch kein GitHub-Repository eingerichtet; der Releasekanal bleibt deaktiviert. Version 0.2.0 enthält den Stand aus CHAT 13, die älteren 0.1.0-Artefakte enthalten Stand 8. Für eine isolierte Vorschau des aktuellen Quellcodes in PowerShell starten:

```powershell
cd C:\Users\dkarsiko\Documents\UXTools\capacity-planner\app
npm run build
npm run preview:isolated
```

Die Vorschau verwendet ausschließlich `app/out/preview-profile/` für Karten, Themes und Ansichtspräferenzen. Sie startet zunächst leer; dort angelegte Testkarten bleiben für weitere Vorschau-Starts erhalten. Echte Planungsdaten unter `%APPDATA%\capacity-planner` bleiben unberührt. Falls die Abhängigkeiten fehlen, vorher `npm install` ausführen.

Für Entwicklung mit automatischem Neuladen gibt es weiterhin `npm run dev`. Dieser Befehl verwendet ohne explizites Profil die regulären Entwicklungsdaten und ist deshalb nicht der empfohlene Vorschauweg.

Das Datenformat ist Version 2. Der alte Installer 0.1.0 aus Stand 8 kann dieses Format nicht lesen; alte und neue App daher nicht auf dasselbe bereits migrierte Datenprofil zugreifen lassen. Version 0.2.0 migriert alte Stundenkarten beim Laden; vor dem ersten Schreiben wird die ursprüngliche Datei gesichert.

## Windows-Build

```powershell
npm run build:win
```

Der Windows-x64-Installer liegt anschließend unter `dist/Capacity-Planner-0.3.0-Setup.exe`. Die Installation ist standardmäßig für den aktuellen Benutzer vorgesehen, der Zielordner lässt sich auswählen. Die App ist nicht digital signiert. Es werden keine Dateien veröffentlicht oder hochgeladen. Die SHA-256-Prüfsumme des geprüften Installers liegt daneben als `.exe.sha256`. Der Name enthält ab 0.3.0 keine Leerzeichen, damit Manifest und späteres GitHub-Asset denselben Dateinamen verwenden.

Das bereitgelegte `../appicon.png` wird beim Windows-Build automatisch übernommen. `scripts/prepare-icon.cjs` erzeugt daraus ein Windows-ICO mit 16, 24, 32, 48, 64, 128 und 256 px und übernimmt das originale PNG für das Fenster. Die Konvertierung verwendet ein isoliertes temporäres Electron-Profil unter `out/`, das anschließend entfernt wird. Das Motiv wird nicht verändert. App, Installer und Deinstaller verwenden das bereitgelegte Icon.

Für einen entpackten Test-Build:

```powershell
npm run build:win:dir
```

`dist/win-unpacked/CapacityPlanner.exe` kann direkt gestartet werden, solange der gesamte Ordner zusammenbleibt. Ein zusätzliches portables Einzeldatei-Paket wird nicht gebaut.

Die Daten bleiben unter `%APPDATA%\capacity-planner\data.json`, das Backup liegt daneben als `data.backup.json`. Die installierte Version verwendet damit denselben Datenordner wie die Entwicklungsversion. Das Programm verhindert im gepackten Betrieb den gleichzeitigen Start mehrerer Instanzen im selben Profil. Die reguläre Deinstallation löscht die Planungsdaten nicht. Eine Kopie von `data.json` und `data.backup.json` genügt zur Sicherung der Karten und Themes.

## Architektur

- `src/main`: Electron-Hauptprozess, Fenster und lokale JSON-Persistenz
- `src/preload`: eng begrenzte, typisierte IPC-API
- `src/renderer`: React-Oberfläche
- `src/shared`: gemeinsame Datenmodelle
- Nutzerdaten und Backup liegen im Electron-`userData`-Ordner, nicht im Installationsverzeichnis.

Schritte 1–8 und CHAT 9–13 sind umgesetzt: Jahresansicht, Karten, Formulare, Monatssummen, Drag & Drop, Theme Manager, Einstellungen, globale Spaltenbreite, Zeitmodell mit Minuten, Stunden und Tagen sowie Planungsdaten-Import/-Export. Der Windows-Installer 0.2.0 enthält diese Erweiterungen. Zeitbereiche werden intern in ganzen Minuten komponentenweise addiert, CHF und EUR getrennt angezeigt. Zentrale Farbvariablen steuern auch die subtilen Gradients. Prüfungen und Grenzen sind in `../codex-plan.md` dokumentiert.

Karten lassen sich mit der Maus innerhalb eines Monats sortieren und zwischen den Monaten des angezeigten Jahres verschieben. Am Rand scrollen Jahresansicht und die Monatsspalte unter dem Mauszeiger automatisch, auch gleichzeitig. Bearbeitete Karten und Kartenbuttons starten keinen Drag. Escape bricht das Ziehen ab. Eine fokussierte Karte lässt sich außerdem mit Leertaste aufnehmen, per Pfeiltasten verschieben und mit Leertaste ablegen. Monat und Reihenfolge werden beim Ablegen über die bestehende Speicherung gesichert; bei einem Schreibfehler wird die Verschiebung zurückgenommen.

## Themes

Der Einstellungen-Button links im Header, Rechtsklick auf den Header → „Einstellungen“ oder `Ctrl+,` öffnen die Einstellungen mit den Reitern „Themes“, „Daten / Import & Export“ und „Updates“. Im Reiter „Themes“ wählt ein Dropdown das Theme aus; der Editor ist direkt eingebettet. Enthalten sind Bernstein, Zitrus, Lagune, Nachtflieder, Tiefwald, Nebula, Karmin und Dämmerung. Nebula ist das violette Standardtheme.

Alle 19 Farbvariablen einschließlich der Verlaufstöne können per Farbwähler oder Hex-Eingabe angepasst werden. Die Vorschau färbt auch die Jahresansicht live. Themes lassen sich benennen, duplizieren, auf ihre ursprünglichen Farben zurücksetzen und nach Rückfrage löschen; mindestens ein Theme bleibt erhalten. „Speichern“ bzw. `Ctrl+Enter` übernimmt die Auswahl und Änderungen und lässt die Einstellungen offen. „Verwerfen“ setzt auf den zuletzt gespeicherten Stand zurück. Escape oder „×“ schließt die Einstellungen und verwirft ungespeicherte Änderungen samt Vorschau. Escape in der Löschrückfrage schließt nur diese Rückfrage. Themes werden mit den Planungsdaten lokal und atomar gespeichert. Bestehende Dateien ohne Themes bleiben kompatibel; beschädigte Theme-Einstellungen verbergen keine ansonsten gültigen Karten.

## Ansicht

Der Footer unterhalb der Jahresansicht stellt die globale Spaltenbreite von 180 bis 360 px ein. Standard und Reset sind 252 px. Statt Beschriftungen und Text-Buttons stehen vor beiden Reglern Icons; ein Klick auf das Icon setzt den jeweiligen Regler zurück. Der Regler lässt sich mit den Pfeiltasten bedienen und ist während Drag & Drop gesperrt. Im Formular stehen Zeit|Einheit und ~Umsatz|Währung in zwei gleichen Spalten; bei schmalen Spalten stehen die Summen bei Bedarf in einer weiteren Zeile. Monatstitel und Summen bleiben beim Scrollen stehen.

Im Footer neben der Spaltenbreite skaliert ein zweiter Regler Schrift und textgebundene Feldhöhen von 80 bis 130 % (Standard 100 %, Schritte von 5 %). Alle Schriftgrößen laufen über die zentrale CSS-Variable `--ui-scale`; die Spaltenbreite bleibt davon unberührt. Der Wert wird lokal unter `capacity-planner:ui-scale` gespeichert, ungültige Werte fallen auf 100 % zurück.

Ein Klick auf die Jahreszahl springt zum aktuellen Jahr; Pfeile und Mausrad wechseln wie bisher. Die Header-Steuerelemente erscheinen, sobald der Mauszeiger irgendwo über dem Header ist. Weil Ziehbereiche keine Mausereignisse an die Seite weitergeben, meldet der Hauptprozess die Zeigerposition (Abfrage alle 100 ms, gesendet nur bei Änderung). Im Kartenformular speichert Enter in einem einzeiligen Feld oder Auswahlfeld eine gültige Karte; im Beschreibungsfeld erzeugt Enter weiterhin eine neue Zeile.

Spaltenbreite und zuletzt angezeigtes Jahr bleiben als lokale Ansichtspräferenzen im Electron-Profil nach einem Neustart erhalten. Der Reset ändert nur die Breite; Jahr, Karten und Themes bleiben erhalten. Diese Präferenzen stehen außerhalb von `data.json`, das Planungsdatenformat enthält diese Ansichtspräferenzen nicht.

Der „+“-Button erscheint bei Spalten-Hover und während Tastaturbedienung bei Fokus in der Spalte. Nach einer Fokus-Rückgabe aus Formularen oder Dialogen hält er sich bei Mausbedienung nicht mehr sichtbar, wenn die Maus die Spalte verlässt.

## Zeitmodell und Migration (CHAT 11)

`src/shared/time.ts` enthält Parser, Umrechnung, Rundung und Zeitformatierung. `src/shared/migration.ts` validiert und migriert Daten; `src/shared/totals.ts` berechnet die Monatssummen. Formularzustand und Darstellung bleiben in den jeweiligen React-Komponenten.

- Datenversion 2 speichert pro Karte `minutesMin` und `minutesMax` als nichtnegative, sichere ganze Zahlen sowie `timeUnit: 'm' | 'h' | 'd'` als bevorzugte Eingabe-/Anzeigeeinheit.
- `1h = 60 Minuten`, `1d = 1440 Minuten` (24 Stunden).
- Zeit akzeptiert Einzelwerte, Bereiche, Dezimalpunkt/-komma und ein abschließendes Suffix: `90m`, `1.5h`, `1d` oder `1-2d`. Ohne Suffix gilt die Dropdown-Einheit; neue Karten beginnen mit Stunden. Ein Suffix aktualisiert das Dropdown.
- Gerundet wird je Bereichsende auf die nächste ganze Minute, exakte halbe Minuten aufwärts. Beispielsweise wird `0.075h` zu 5 Minuten, `0.49m` zu 0 und `0.5m` zu 1 Minute. Dezimalarithmetik verhindert Rundungsfehler an der Halbminutengrenze. min ≤ max wird vor der Rundung geprüft.
- Einheitenwechsel rechnen den bestehenden Minutenwert um. Bis zu sechs Nachkommastellen in der Formulareingabe reichen, um dieselbe ganze Minute zurückzuerhalten. Bei ungültiger, nichtleerer Zeiteingabe ist der Einheitenwechsel bis zur Korrektur gesperrt. Ungültige Eingaben verhindern das Speichern.
- Bearbeiten und Neustart erhalten Minutenwerte und Einheit. Karten zeigen weiterhin ihre gewählte Einheit. Summen zeigen immer Tage, Stunden und Minuten: `90m → 0d 1h 30m`. Bereiche zeigen beide Enden vollständig, im Footer auf zwei Zeilen, z. B. `0d 1h 30m – 1d 0h 0m`. Leere Monate zeigen `–`, vorhandene Nullwerte `0d 0h 0m`. Monatsfooter bleiben bei allen Spaltenbreiten gleich hoch.

Beim Laden von Version 1 gelten `hoursMin`/`hoursMax` ausdrücklich als **Stunden**: mit 60 multiplizieren und nach derselben Regel auf Minuten runden, als Einheit `h` übernehmen. Alle übrigen Karteninformationen, Themes und Fensterdaten bleiben erhalten. Die Migration verändert ihr Eingabeobjekt nicht; Version 2 wird beim wiederholten Laden nicht nochmals umgerechnet. Die Originaldatei wird beim Laden noch nicht überschrieben. Die nächste Speicherung (spätestens beim Schließen) schreibt Version 2 atomar und sichert davor die vorherige Datei über den bestehenden Backupweg. Das gilt auch bei unveränderten Karten. Bei Schreibfehlern lässt sich die Migration erneut speichern. Unterminütige alte Dezimalwerte werden gemäß der dokumentierten Rundungsregel normalisiert; die erste Sicherung enthält die unveränderte Version 1.

Unbekannte Versionen, ungültige Kartendaten und beschädigtes JSON verhindern den Start mit einer Fehlermeldung, ohne Datendatei oder Backup zu überschreiben. Die bestehende Wiederherstellung bei beschädigten Theme-Einstellungen bleibt erhalten.

## Speicherung und Tests

Der Hauptprozess bündelt Daten- und Fensteränderungen mit 300 ms Debounce. Er sichert die bisherige `data.json` als `data.backup.json` und ersetzt die Datendatei über eine temporäre Datei mit anschließendem Umbenennen. Unveränderte Daten erzeugen kein neues Backup. Beim Beenden werden ausstehende Änderungen vor dem Schließen geschrieben. Fenstergröße und Position bleiben erhalten; bei maximiertem oder minimiertem Fenster werden die normalen Fenstermaße gespeichert.

Mit Node.js 24 lassen sich die Tests für Summen, Dezimalwerte, Debounce, Backups, konkurrierende Schreibvorgänge und Fehlerbehandlung direkt ausführen:

```powershell
npm test
npm run lint
npm run build
npm run test:drag-drop
npm run test:themes
npm run test:view
npm run test:time
npm run test:electron
```

Das fertig gebaute Paket lässt sich anschließend separat prüfen:

```powershell
npm run build:win
npm run test:packaged
```

Die Tests verwenden isolierte temporäre Verzeichnisse. Die bisherigen lokalen Prüfungen der Schritte 3–5 sind jetzt dauerhaft unter `tests/cards.electron.cjs`, `tests/forms.electron.cjs` und `tests/persistence.electron.cjs` abgelegt. `npm run test:electron` führt alle neun Electron-Prüfläufe nacheinander aus, einschließlich Drag & Drop, Themes, Ansichtseinstellungen, Zeitmodell, Planungsdaten-Import/-Export und Update-Oberfläche. `out/` enthält Screenshots und generierte Prüfarbeitsdateien; diese werden nicht mitgeliefert.

`npm run test:drag-drop` baut die App und führt `tests/drag-drop.electron.cjs` in echtem Windows-Electron mit isolierten Testprofilen aus. Geprüft werden Sortieren, Monatswechsel, leere Monate, Jahresgrenzen, Abbruch, gesperrte Bearbeitung, Speichern mit Fehler/Wiederholung, beide Auto-Scroll-Achsen und Wiederherstellung in einem neuen Electron-Prozess. Echte Nutzerdaten bleiben unberührt. Der Screenshot liegt anschließend unter `out/drag-drop-step6.png`.

`npm run test:themes` prüft die Themes in Windows-Electron einschließlich Menü-Anbindung, Live-Vorschau, Validierung, Speichern, Abbrechen, Duplizieren, Zurücksetzen, Löschbestätigung, Speicherfehlern, Tastatur/Fokus, Mindestfenstergröße und Wiederherstellung nach Neustart. Der Test verwendet isolierte Profile. Der Screenshot liegt unter `out/theme-manager-step7.png`. Theme-Export und -Import sind nicht Bestandteil dieser Umsetzung.

`npm run test:view` prüft den reproduzierten Add-Button-Fehler mit nativen Maus- und Tastatureingaben, Speichern/Abbrechen, Rückkehr aus Dialogen und Jahreswechsel. Bei 180, 252 und 360 px werden Monatswechsel per Drag & Drop, beide Auto-Scroll-Achsen, unabhängiges Scrollen und feststehende Summen geprüft. Weitere Prüfungen betreffen Einstellungen-Navigation, ungespeicherte Theme-Vorschau, Header-Trefferflächen, Formulare bei Mindestfenstergröße, Reset und Wiederherstellung von Breite und Jahr in einem neuen Electron-Prozess. Screenshots liegen unter `out/view-width-180.png`, `out/view-width-360.png` und `out/form-width-*.png`.

`npm run test:packaged` prüft die tatsächlich ausgelieferte `CapacityPlanner.exe` ohne Vite-Server oder Entwicklungs-Electron. Ein frisches, explizit isoliertes `--user-data-dir` schützt echte Nutzerdaten. Der Test prüft Jahreswechsel, Formulare und Zahlenvalidierung, Währungen und Summen, Bearbeiten und Löschen, Drag & Drop, Theme-Speicherung, Einstellungen, Spaltenbreite samt Reset, Minuten-/Tagesbereiche, Import-Bestätigungstoken, Einzelinstanzbetrieb und Wiederherstellung einschließlich Jahr, Breite und Fenstergröße nach Neustart. Eine repräsentative Version-1-Datei mit Stundenkarten über zwei Jahre wird migriert; Originalbackup, Metadaten, Theme und idempotenter Neustart werden geprüft. Die lokale Debugging-Schnittstelle wird ausschließlich vom Test beim Start aktiviert. Außerdem werden Paketversion, Byte-Gleichheit mit dem aktuellen Runtime-Build, eingebettete Icons, begrenzter Paketinhalt und Byte-Gleichheit zwischen NSIS-Installationsinhalt und getesteter App geprüft. Der Pakettest prüft zusätzlich `latest.yml` auf Version, Dateinamen, optionale Größenangabe und SHA-512 des tatsächlichen Installers, den GitHub-Feed sowie die gesperrte Update-Oberfläche und IPC in isolierten/uninstallierten Profilen. Der Installername folgt der Version aus `package.json`. Screenshot und Prüfbericht liegen unter `out/packaged-chat14.png` und `out/packaged-verification.json`.

Die Prüfung erfolgte auf dem vorhandenen Windows-Rechner mit frischem Anwendungsprofil. Der Installer wurde entpackt und geprüft, nicht in das Windows-Benutzerkonto installiert; eine Installation auf einer separaten frischen Windows-Maschine wurde nicht durchgeführt.

## Verifizierter Stand CHAT 11 vom 25.10.2026

CHAT 11 ist umgesetzt. `npm test` besteht mit 21 Tests, `npm run build` einschließlich beider TypeScript-Prüfungen und `npm run lint` sind erfolgreich. Die Formatprüfung der geänderten Quell- und Testdateien besteht. Node meldet weiterhin die bereits vorhandenen Hinweise zur nicht angegebenen Paket-Modulart; die Tests sind erfolgreich.

Die vollständige Windows-Electron-Suite besteht aus den bisherigen sechs Regressionen und `tests/time.electron.cjs`. Der Zeittest prüft echte Version-1-Stundenkarten samt erster Originaldatei-Sicherung, Suffixe, ungültige Eingaben, Dezimalwerte, Nullwerte, Bereiche, Einheitenwechsel, gemischte Summen, Bearbeiten/Löschen und Wiederherstellung in einem neuen Prozess. Unbekannte Dateiversionen, ungültige alte Zeitwerte und beschädigtes JSON lassen Datendatei und Backup unverändert. Formulare wurden bei 180 und 360 px und Mindestfenstergröße geprüft; Screenshots `out/time-form-180.png` und `out/time-form-360.png` wurden visuell geprüft. Alle Prüfungen verwendeten isolierte Profile. Electron lief über den Freigabeweg außerhalb der Ausführungs-Sandbox; Electron-Sandbox und Windows-ACLs blieben unverändert.

Offen: CHAT 12 (Planungsdaten-Import/-Export), CHAT 13 (Gesamtintegration und neuer Installer) sowie CHAT 14 (Updates). Kein neuer Installer und keine Prüfung eines neuen Pakets wurden durchgeführt. Vor CHAT 12 muss die Importstrategie ausdrücklich entschieden werden: empfohlen ist **Ersetzen nach Vorschau, Bestätigung und Sicherung**. Zusammenführen würde zusätzliche Regeln für ID-Konflikte und Reihenfolgen benötigen.

## Planungsdaten-Import und -Export (CHAT 12)

In Einstellungen → „Daten / Import & Export“ öffnet „Exportieren …“ den nativen Windows-Speicherdialog. Exportiert werden Karten aller Jahre. „Importieren …“ öffnet den nativen Dateiauswahldialog und anschließend eine Vorschau mit Dateiname, Kartenanzahl pro Jahr und dem Umfang der bisherigen Planung. Die ausdrücklich gewählte Strategie ist **Ersetzen nach Vorschau, Bestätigung und Sicherung**; Zusammenführen wird nicht angeboten.

Erst nach Aktivieren der Bestätigungs-Checkbox und Klick auf „Planung sichern und ersetzen“ werden alle vorhandenen Karten ersetzt. Abbrechen oder Escape in der Vorschau verwirft den Import und lässt die Einstellungen offen. Leere Dateien haben einen ausdrücklichen Hinweis, dass sie alle Karten entfernen würden. Importierte Daten werden erst nach erfolgreichem Speichern angezeigt. Offene Kartenformulare werden nach erfolgreichem Import verworfen, damit kein alter Entwurf die importierte Planung überschreibt. Themes, Fensterdaten, angezeigtes Jahr und Spaltenbreite bleiben erhalten.

Das Austauschformat ist JSON mit einem eigenen Formatkennzeichen und getrennten Format-/Datenversionen:

```json
{
  "format": "capacity-planner-planning",
  "formatVersion": 1,
  "dataVersion": 2,
  "cards": []
}
```

Jede Karte enthält ausschließlich `id`, `year`, `month`, `order`, `label`, `title`, `description`, `minutesMin`, `minutesMax`, `timeUnit`, `revenueMin`, `revenueMax`, `currency` und `expanded`. Array-Reihenfolge und `order` bleiben unverändert, auch bei Lücken oder gleichen Positionen. Karten werden bei der Anzeige weiterhin nach der bestehenden Sortierlogik geordnet. Zusätzliche Eigenschaften werden beim Lesen ignoriert und beim Export entfernt. Themes, Fensterdaten und Ansichtspräferenzen werden weder exportiert noch aus einer Importdatei übernommen. Eine interne `data.json` ohne Austauschformat-Kennzeichen ist keine Importdatei.

Import unterstützt `formatVersion: 1` mit `dataVersion: 1` oder `2`. Datenversion 1 enthält `hoursMin`/`hoursMax` ausdrücklich in Stunden; die vorhandene Migration multipliziert mit 60 und rundet auf ganze Minuten. Die bevorzugte Einheit wird `h`. Datenversion 2 enthält sichere, nichtnegative ganze Minuten und `timeUnit: "m" | "h" | "d"`. Ein Tag entspricht exakt 1440 Minuten. Export schreibt immer Datenversion 2.

Vor jeder Übernahme werden JSON, Kennzeichen, Versionen und alle Karten vollständig geprüft: eindeutige nichtleere String-IDs, ganzzahliges Jahr 1–9999, Monat 0–11, sichere nichtnegative ganzzahlige Reihenfolge, Textfelder, Boolean-Aufklappzustand, endliche nichtnegative Umsatzbereiche mit min ≤ max, gültige Minutenbereiche, Zeiteinheit und EUR/CHF. Der Hauptprozess hält die geprüften Karten bis zur Bestätigung im Speicher; der Renderer erhält nur eine Zusammenfassung und ein einmal verwendbares Token. Ändert sich die Planung zwischen Vorschau und Bestätigung, wird eine neue Vorschau verlangt. Änderungen an der Quelldatei nach der Vorschau verändern die bereits geprüften Importdaten nicht.

Der vorhandene Persistenzweg sichert vor dem Ersetzen den bisherigen vollständigen Stand als `data.backup.json` (bei noch leerem Profil den leeren Stand). Neue Daten und Backup werden zunächst vorbereitet; scheitert das abschließende Umbenennen, wird das vorherige Backup wiederhergestellt. Ungültige Dateien, Abbruch und geprüfte Datei-/Schreibfehler erhalten Datendatei und bestehendes Backup unverändert. Das Backup bleibt eine rotierende Sicherung: Spätere normale Änderungen können es wie bisher ersetzen. Für längerfristige Sicherungen eine separate Exportdatei verwenden. Export schreibt über eine separate temporäre Datei; interne Daten- und Backup-Dateien können nicht als Exportziel gewählt werden.

Fachlogik: `src/shared/planning-transfer.ts`; Dateizugriff und Vorschautoken: `src/main/planning-transfer.ts`; native Dialoge und eng begrenzte IPC-Kanäle: Main/Preload; Oberfläche: `PlanningDataSettings.tsx`. Es gibt keine neuen Abhängigkeiten und keinen Renderer-Dateisystemzugriff.

## Verifizierter Stand CHAT 12 vom 25.10.2026

`npm test` besteht mit **30 Tests**, einschließlich Mehrjahres-Rundlauf, Versions-/Feldvalidierung, Stundenmigration, Vorschau/Abbruch, veralteter Vorschau, Speicher-/Backupfehlern und Wiederholung. Ein echter Windows-Dateisperrtest verhindert das letzte Umbenennen und prüft die Wiederherstellung des vorherigen Backups. Build mit beiden TypeScript-Prüfungen und Lint sind erfolgreich. Die bestehenden Hinweise zur Paket-Modulart bleiben bestehen.

Die Windows-Electron-Suite umfasst acht erfolgreiche Prüfläufe. `tests/planning-transfer.electron.cjs` ergänzt die sieben bisherigen Regressionen und prüft Oberfläche, Fokus/Escape, explizite Bestätigung, Vorschau ohne Schreiben, neue/alte Zeitformate, alle Jahre und Felder, Export/Import-Rundlauf, leere Dateien, ungültige Dateien, fehlende Dateien, Export-/Speicherfehler, unveränderte Backups sowie Wiederherstellung von Karten, Theme, Jahr und Breite in einem neuen Prozess. Einzeln: `npm run test:transfer`. Die nativen Dialogmethoden werden in diesem automatisierten Test durch kontrollierte Auswahl-/Abbruchantworten ersetzt; Main, Preload, IPC und Persistenz laufen tatsächlich. Screenshot `out/planning-preview.png` wurde bei 960 × 620 px visuell geprüft. Alle Prüfungen nutzten isolierte Profile. Electron lief über den Freigabeweg; Electron-Sandbox und Windows-ACLs wurden nicht verändert.

Offen bleibt die manuelle Bedienprüfung der echten Windows-Dateidialoge: Das sichtbare isolierte Testfenster wurde gefunden, aber Computer Use meldete „Computer Use app approval timed out“. Daher ist die tatsächliche OS-Dialogbedienung nicht als geprüft markiert. Ebenso offen: CHAT 13 (Gesamtintegration, neuer Installer und Paketprüfung), CHAT 14 (Updates) und Prüfung auf einem separaten Windows-Rechner. Der vorhandene Installer enthält weiterhin Stand 8; in CHAT 12 wurde kein neuer Installer gebaut. CHAT 13 wurde nicht begonnen.

## Verifizierter Stand CHAT 13 vom 25.10.2026

Der neue Windows-x64-Installer **0.2.0** liegt unter `dist/Capacity Planner-0.2.0-Setup.exe` (112.107.148 Bytes). Er enthält den Stand aus CHAT 9–13 einschließlich Datenversion 2 und Planungsdaten-Import/-Export. Die älteren 0.1.0-Artefakte bleiben unverändert erhalten. Es gibt keine Updates, Webansicht oder neue Abhängigkeiten.

SHA-256: `85ce9a11e07368263d0ceb0ff2fcf064d42993691ac68358100347780d1cb1ab`. Die zugehörige Prüfsummendatei liegt neben dem Installer. `out/packaged-verification.json` dokumentiert den automatisierten Pakettest.

Die tatsächlichen nativen Windows-Dateidialoge wurden mit Computer Use in der gepackten App und einem frischen Testprofil unter `out/native-package-profile-*` bedient. Geprüft wurden Speichern, Exportinhalt ausschließlich mit Planungsdaten, Exportabbruch, Importabbruch, Öffnen einer JSON-Datei über den nativen Dialog, Vorschau über zwei Jahre, ausdrückliche Checkbox-/Button-Bestätigung, Sicherung und Ersetzen sowie Wiederherstellung in einem neuen gepackten Prozess. Dateivergleiche bestätigen: beide Abbrüche und die Vorschau lassen Daten und Backup bytegleich; bestätigtes Ersetzen erhält sämtliche Importkartenfelder und sichert die exakte bisherige Datei. Bericht: `out/native-dialog-verification.json`. Die aus CHAT 12 offene OS-Dateidialogprüfung ist damit abgeschlossen.

Der tatsächliche Installer-Assistent wurde gestartet: Version, bereitgelegtes Icon, Benutzerinstallation ohne Administratorrechte und wählbarer Zielordner wurden geprüft. Vor dem Installieren wurde abgebrochen; der Assistent endete mit Code 0. Bericht: `out/installer-verification.json`. Eine Installation ins Windows-Benutzerkonto und eine Deinstallation wurden nicht durchgeführt. Der Pakettest entpackt den Installer und bestätigt die Byte-Gleichheit des Installationsinhalts mit der getesteten EXE und `app.asar`.

Die Icon-Konvertierung und sämtliche App-Prüfungen verwenden isolierte Profile. Build, beide TypeScript-Prüfungen, Lint und die vollständige Formatprüfung mit `npx prettier --check .` sind erfolgreich; `npm test` besteht mit 30 Tests. Alle acht Windows-Electron-Prüfläufe bestehen im abschließenden Lauf ohne parallele Desktop-Bedienung. Die bekannten Node-Hinweise zur Paket-Modulart bleiben bestehen. Ein erster Electron-Gesamtlauf während paralleler Desktop-Bedienung hatte einen Timeout im Drag-/Speicherfehlertest; der anschließende isolierte Drag-&-Drop-Lauf und die abschließende gesamte Suite bestanden. Der Pakettest wurde an die neuen Eingaben angepasst und sein zusätzlicher ASAR-Buildvergleich für Windows-Pfadtrenner korrigiert; der neue Vergleich besteht.

Die gepackte App kann ohne Installation mit einem weiteren isolierten Profil gestartet werden:

```powershell
cd C:\Users\dkarsiko\Documents\UXTools\capacity-planner\app
& ".\dist\win-unpacked\CapacityPlanner.exe" "--user-data-dir=$PWD\out\packaged-preview-profile"
```

Offen bleiben die Installation/Deinstallation im Benutzerkonto, die Prüfung auf einem separaten frischen Windows-Rechner, Code-Signing und die zusätzliche manuelle Header-Rechtsklickprüfung aus Schritt 7. Die automatisierten Menü-/Settings-Regressionen bestehen; sie ersetzen diese manuelle Rechtsklickprüfung nicht. Als Nächstes folgt CHAT 14 (manuelle GitHub-Release-Updates); er wurde nicht begonnen.

## Manuelle Windows-Updates (CHAT 14, lokal vorbereitet)

Einstellungen → „Updates“ zeigt die App-Version und „Nach Updates suchen“. Es gibt keine Prüfung beim Start, keinen automatischen Download und keine Installation beim normalen Beenden. Eine gefundene Version wird erst über „Herunterladen und installieren“ übernommen. Der vollständige Installer wird heruntergeladen und durch `electron-updater` anhand der Release-Metadaten geprüft. Delta- und Web-Installer sind deaktiviert. Während des Downloads sind Fortschritt und Abbruch sichtbar. Nach erfolgreichem Download werden ausstehende Speicherungen abgeschlossen, erst dann wird der NSIS-Installer gestartet; er soll die App nach der Aktualisierung wieder starten. Bei Speicherfehlern bleibt die App offen und die Installation kann nach Beheben des Fehlers erneut versucht werden. Offene Kartenentwürfe müssen zuvor gespeichert oder abgebrochen werden.

Die neue Laufzeitabhängigkeit `electron-updater` (installiert: 6.8.11) übernimmt GitHub-Releases, Download, Prüfsummenprüfung und den NSIS-Aufruf. Zustände und Persistenzfreigabe liegen in `src/main/update-controller.ts`, die Anbindung der Bibliothek in `src/main/update-backend.ts`. Der Renderer erhält nur typisierte Zustände und Befehle über Preload/IPC; er kann weder Feed-URLs noch Installerpfade festlegen. [Offizielle Dokumentation](https://www.electron.build/docs/features/auto-update/) beschreibt das zugrunde liegende Verfahren; die Implementierung wurde gegen die tatsächlich installierte Bibliotheksversion geprüft.

Updates werden ausschließlich für eine installierte Windows-App mit konfiguriertem Releaseziel aktiviert. Der NSIS-Installer erzeugt dafür `resources/capacity-planner-installed`. Die entpackte App und Entwicklungsstarts haben diesen Marker nicht. Ein explizites `--user-data-dir` sperrt echte Updates zusätzlich, damit der Installer nach einem Testneustart nicht versehentlich das normale Profil öffnet. Die Test-Suite simuliert die Installation ausschließlich im eigenen Prozess; produktiver Code hat keinen Test-Override.

`resources/release-target.json` enthält derzeit leere `owner`-/`repo`-Felder. Das wurde ausdrücklich so entschieden, weil noch kein Repository existiert. Der Build erzeugt `latest.yml` und `app-update.yml` mit erkennbaren GitHub-Platzhaltern; die App kontaktiert diese nicht. `scripts/build-windows.mjs` übernimmt später gültige Werte aus derselben JSON-Datei in die Builder-Konfiguration und erzwingt `--publish never`. Die erzeugte `latest.yml` mit Platzhaltern ist aktuell kein nutzbarer Updatekanal.

### Späterer Releaseablauf

1. Ein öffentlich erreichbares GitHub-Repository/Releaseziel festlegen und `owner`/`repo` in `resources/release-target.json` eintragen. Keine Zugriffstokens in die App oder Konfiguration schreiben. Ein privater Releasekanal mit Client-Authentifizierung ist nicht umgesetzt.
2. Eine Basisversion mit dieser Konfiguration bauen und zunächst manuell in einer isolierten Windows-Testumgebung installieren. Die älteren Versionen 0.1.0/0.2.0 enthalten keinen Updater und können sich nicht selbst auf die neue Basis aktualisieren. Auch der aktuelle 0.3.0-Platzhalterbuild bekommt durch bloßes Anlegen eines Repositories keinen aktiven Feed; dafür ist ein neuer Build mit realer Konfiguration nötig.
3. Für den nächsten Release die Version mit `npm version patch --no-git-tag-version` erhöhen. `npm test`, `npm run build:win`, `npm run lint`, `npx prettier --check .`, `npm run test:electron` und `npm run test:packaged` ausführen. Der vorhandene Installer bleibt vollständig; es werden keine Delta-Pakete gebaut.
4. Erst nach ausdrücklicher Freigabe einen veröffentlichten GitHub-Release mit passendem Tag, zum Beispiel `v0.3.1`, anlegen und den exakt benannten `Capacity-Planner-0.3.1-Setup.exe` sowie die dazugehörige `latest.yml` gemeinsam hochladen. Eine Blockmap ist in diesem vollständigen Downloadverfahren nicht erforderlich. Die aktuellen Skripte laden selbst nichts hoch.
5. In der zuvor installierten älteren Basis nach Updates suchen, Download/Fortschritt/Abbruch und anschließend das echte Update testen. Karten, Themes, Ansichtseinstellungen und Backups vor/nach dem echten Installations-/Neustartablauf vergleichen. Erst dieser Test erfüllt den ausstehenden End-to-End-Nachweis.

### Prüfgrenze

Die 38 Node-Tests umfassen Update-Zustände, fehlendes Releaseziel, Installations-/Profilfreigabe, doppelte Aufrufe, Netzwerk-/Dateiprüfungsfehler, Abbruch, Speichersperre und Wiederholung. `npm run test:updates` führt den neuen Windows-Electron-Test aus. Dort laufen Main, Preload, IPC und Oberfläche tatsächlich; nur `NsisUpdater` wird durch ein simuliertes Backend ersetzt. Geprüft werden die deaktivierte Konfiguration, keine Startanfrage, aktuelle/verfügbare Version, Fehler, Fortschritt, Abbruch, ein realer Persistenzfehler und die Reihenfolge vor dem simulierten Installationsaufruf. Daten und Backup werden bytegenau verglichen. Der Test installiert nichts und nutzt kein echtes GitHub-Ziel. Screenshots: `out/updates-disabled.png`, `out/updates-download.png`.

**Offen:** Kein Repository und keine Releases vorhanden. Download und tatsächlicher Austausch einer alten installierten Version durch einen neuen GitHub-Release samt automatischem Neustart wurden deshalb nicht real geprüft. Die volle CHAT-14-Abnahme bleibt offen; lokal vorbereitete Funktion und Tests sind davon getrennt dokumentiert. Die bisherigen offenen Installations-/Fremdrechner-/Signierungsprüfungen bleiben bestehen. Es wurde nichts veröffentlicht.

Abschließend geprüft am 25.10.2026: **38/38 Tests**, Build mit beiden TypeScript-Prüfungen, Lint, vollständige Formatprüfung, alle **neun Windows-Electron-Prüfläufe** und der erweiterte Pakettest erfolgreich. Der aktuelle Installer hat 101.287.565 Bytes; SHA-256 `88faeebfad83a38d346a617a7cad8b51cb0a58fd4de92ca735cfbc51578c4ce0` (auch als `.exe.sha256`). `latest.yml` enthält bei deaktivierten Delta-Paketen kein Größenfeld; dieses Feld ist optional. Der Test prüft es, falls vorhanden, sowie immer Version, exakten Dateinamen und SHA-512 der gesamten Installerdatei. Berichte: `out/update-verification.json`, `out/packaged-verification.json`. Die Paketprüfung nutzt die echte neue EXE; Installation und Netzwerk im Updatetest sind ausdrücklich simuliert. Electron-Sandbox und Windows-ACLs blieben unverändert; alle App-Prüfungen nutzten isolierte Profile. Der 0.3.0-Installer wurde nicht im Benutzerkonto installiert oder als echtes Update ausgeführt.

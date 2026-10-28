# MTA New York

## Überblick

Diese Integration bringt die **New Yorker U-Bahn** der MTA und die Staten Island Railway in Gladys. Sie liefert die **nächsten Züge in Echtzeit** an den Stationen deiner Wahl (drei im Formular, bis zu 10 weitere per Schaltfläche), gefiltert nach Linie und Richtung, wie die Countdown-Anzeigen am Bahnsteig. Außerdem verfolgt sie die **Betriebslage** von bis zu sechs Linien (normaler Betrieb, Hinweis, geplante Bauarbeiten, gestörter Betrieb, Betrieb eingestellt) mit den Meldungen der MTA. Jede Station und jede Linie wird zu einem Gerät für das Dashboard und für Szenen.

Die Daten stammen aus den **offiziellen Open Data der MTA**, ohne Konto und ohne Schlüssel: den Echtzeit-Feeds der U-Bahn (GTFS-RT), ihren Betriebsmeldungen und der offiziellen Stationsliste (data.ny.gov). Die Züge der verfolgten Stationen werden mit **einer Anfrage pro Liniengruppe** gelesen (A C E, B D F M, L…), standardmäßig jede Minute (alle 10 Minuten, solange keine Station in der nächsten halben Stunde einen Zug ankündigt). Die Meldungen werden alle 5 Minuten gelesen, wenn eine Linie verfolgt wird.

Die MTA listet jeden Zug der nächsten Stunde oder so mit seinen Halten bis zur Endstation. Eine Fahrt, der noch kein Zug zugeteilt ist, wird wie auf den Anzeigen gezeigt, aber mit „(geplant)“ markiert: Sie könnte ausfallen. Die MTA liefert **keine Verspätung** und markiert **keinen ausgefallenen Zug**: Die Integration erfindet sie nicht.

Dies ist eine **Cloud**-Integration: Sie kontaktiert `api-endpoint.mta.info` und `data.ny.gov`. Sonst verlässt nichts dein Netzwerk. Die Daten stammen von den Servern der MTA und werden **so, wie sie sind**, angezeigt: Sie können ungenau oder unvollständig sein, und was du siehst, **ist womöglich nicht in Echtzeit** (gelesen alle 30 Sekunden bis 10 Minuten). Diese Community-Integration ist weder mit der MTA verbunden noch von ihr unterstützt oder lizenziert.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Sonst nichts: Die Open Data der MTA brauchen weder Konto noch Schlüssel.

## Konfiguration

| Feld               | Was eintragen                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Station 1, 2, 3    | Der Name der Station, wie er dort steht („Times Sq-42 St“, „Bedford Av“), oder eine ihrer Haltestellen-IDs („R16“).    |
| Linie              | Nur diese Linie: „A“, „7“, „Q“, „S 42 St“, „SIR“. Leer: alle Linien der Station.                                       |
| Richtung           | Eine Seite („Uptown“, „Downtown“, „Manhattan“: die Wörter am Bahnsteig) oder Wörter des Ziels. Leer: beide Richtungen. |
| Verfolgte Linien   | Die Linien, deren Betriebslage du verfolgst, höchstens sechs: „A, F, L, 7“.                                            |
| Lesen der Echtzeit | Alle 30 Sekunden, jede Minute, alle 2 Minuten oder alle 5 Minuten.                                                     |
| Sprache der Texte  | Namen der Geräte, Zusammenfassungen und Ausgaben der Szenen. Stationsnamen und Meldungen bleiben auf Englisch.         |

Eine Station fasst alle Linien ihres Komplexes zusammen: „Times Sq-42 St“ liefert die 1 2 3, die 7, die N Q R W, den Shuttle und die A C E von 42 St-Port Authority. Manche Namen gehören zu mehreren Stationen („86 St“ liegt an sechs Linien): Gib die Linie mit an, den Namen so, wie ihn **Station suchen** schreibt („86 St (Q)“), oder eine Haltestellen-ID. **Station suchen** liefert die Stationen mit einigen Wörtern, mit Bezirk, Haltestellen-IDs und Linien („86 St (Q) · Manhattan [Q04] → Q“). **Verbindung testen** liest die Stationsliste erneut und liest sofort jede Station und jede Linie.

Eine Richtung behält eine Seite der Station: „Uptown“ / „Downtown“, „N“ / „S“ oder die Wörter, die die MTA an den Bahnsteig schreibt („Manhattan“, „Queens“, „Coney Island“). Andere Wörter behalten die Ziele, die sie enthalten („Far Rockaway | Lefferts“).

Mehr Stationen als die drei des Formulars (Zuhause, Arbeit, Schule…): **Station hinzufügen** nimmt dieselben drei Felder — Station, Linie, Richtung — und verfolgt bis zu 10 weitere. **Stationen auflisten** zeigt alle verfolgten Stationen nummeriert; **Station entfernen** nimmt diese Nummer (oder den Namen). Die hinzugefügten Stationen liegen in der Konfiguration von Gladys und sind damit in ihren Sicherungen enthalten.

## Verwendung

### Geräte

Erstelle im Tab **Entdecken** die gewünschten Geräte:

- **MTA \<Station\>**: der nächste Zug als Text („A → Far Rockaway-Mott Av · 3 Min.“), die Wartezeit des nächsten und des folgenden Zugs (Minuten);
- **MTA Linie A**, **MTA 42 St Shuttle**…: die Betriebslage als Text („Gestörter Betrieb: Downtown F/M trains are running with delays…“) und die Zahl der aktuellen Meldungen.

### Betriebslage

Die MTA veröffentlicht **Meldungen**: einen Text, die betroffenen Linien, ihre Zeiträume und eine Art. Der Zustand einer Linie ergibt sich aus ihrer schwersten laufenden Meldung: **Betrieb eingestellt**, **gestörter Betrieb** (Verspätungen, reduzierter Betrieb, ungeplante Umleitungen), **geplante Bauarbeiten** (die Meldungen „Planned - …“, an jedem Wochenende auf vielen Linien), **Hinweis**; **normaler Betrieb** ohne Meldung. Eine Meldung, die in den nächsten drei Tagen beginnt, wird als „demnächst“ angezeigt.

### Dashboard-Widgets

![Das Widget MTA Abfahrten an Times Sq-42 St und das Widget MTA Betriebslage für fünf Linien (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-mta-new-york/main/docs/assets/widgets.de.png)

- **MTA Abfahrten**: die nächsten Züge einer Station, kompakt. Eine Zeile pro Linie und Ziel, mit ihren nächsten Zügen hintereinander („2 · 9 · 17 Min.“); grau, wenn der nächste Zug nur geplant ist. Die Einstellung **Angezeigte Fahrten** legt die Zahl der Zeilen fest. Wähle eine verfolgte Station oder gib in den Widget-Einstellungen eine beliebige Station (und eine Linie) ein. Mit **Mehrere Stationen** zeigt ein Widget mehrere Stationsgeräte: Die Geräte derselben Station werden unter ihrem Namen zusammengefasst; bei verschiedenen Stationen beginnt jede mit einer eigenen Zeile.
- **MTA Betriebslage**: der Zustand jeder Linie, dann die laufenden Meldungen und die der nächsten drei Tage, mit ihren Zeiten. Tippe auf eine Karte für den vollständigen Text. Die verfolgten Linien, die in den Einstellungen eingetragenen oder die Linien deiner Stationen, wenn du keine verfolgst.

### Szenen

Auslöser, einmal pro Änderung (die erste Lesung dient nur als Referenz):

- **MTA: Zug bald**: Ein Zug an einer verfolgten Station fährt in 2, 3, 5, 10, 15 oder 20 Minuten.
- **MTA: Linie gestört**: Eine verfolgte Linie hat ungeplante Verspätungen, Änderungen oder eine Einstellung. Geplante Bauarbeiten lösen es nicht aus.
- **MTA: wieder normal**: kein ungeplantes Problem mehr auf der Linie.
- **MTA: neue Meldung**: Die MTA veröffentlicht eine Meldung zu einer verfolgten Linie, aktuell oder demnächst (Filter: Hinweis, geplante Bauarbeiten, Verspätungen und Änderungen, Einstellung).

Jeder liefert einen fertigen Satz, `{{triggerEvent.data.summary}}`, und seine Werte (Linie, Ziel, Seite, Uhrzeit, Titel, Text, Art, Zeiten…). Die Aktionen **MTA: nächste Züge** und **MTA: Lage einer Linie** liefern dieselbe Art von Werten, für eine Nachricht oder eine Bedingung.

Beispiele:

- Wenn die L Richtung 8 Av in 5 Minuten in Bedford Av abfährt → die Flurlampe grün schalten.
- Wenn die Linie A gestört ist → die Zusammenfassung vor dem Losgehen aufs Handy schicken.
- Jeden Werktag um 7:30 → die nächsten Züge deiner Station lesen und vom Küchenlautsprecher ansagen lassen.

### Transport

Nur Cloud: Die Daten kommen aus dem Internet. Die Feeds der Linien deiner Stationen bei jeder Lesung, die Meldungen alle 5 Minuten, die Stationsliste einmal pro Woche.

## Fehlerbehebung

- **„Unbekannt oder mehrdeutig“**: Nutze **Station suchen** und kopiere den Namen, wie er geschrieben ist („86 St (Q)“), oder eine Haltestellen-ID; für eine Linie ihren Buchstaben oder ihre Zahl („A“, „7X“), „S 42 St“, „Franklin shuttle“, „Rockaway shuttle“ oder „SIR“ (ein bloßes „S“ ist einer von drei Shuttles).
- **„(geplant)“ hinter einem Zug**: Dieser Fahrt ist noch kein Zug zugeteilt; sie könnte ausfallen.
- **Kein Zug in der eingegebenen Richtung**: Leere die Richtung, um alle Züge zu sehen, und kopiere dann die Wörter der Seite oder des Ziels.
- **Gar kein Zug**: Manche Linien fahren nicht rund um die Uhr (die B am Wochenende, die Z außerhalb der Stoßzeiten); das Gerät wird dann alle 10 Minuten gelesen.
- **„Die Open Data der MTA antworten nicht“**: Die Integration versucht es bei jeder Lesung erneut; ein kurz ausgefallener Feed liefert so lange seine letzte Lesung.
- **Ein Problem melden**: Drücke **Diagnose** und kopiere die Zeilen, die mit „MTA diagnostic“ beginnen, aus dem Tab Protokolle in ein GitHub-Issue oder eine Antwort im Forum, mit den Versionen von Gladys und der Integration.

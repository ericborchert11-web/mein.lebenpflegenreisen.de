# Material Ehrenamt-Akquise

**Entwürfe. Nichts hiervon wird automatisch ausgespielt.** Das Portal-Repo
liefert `marketing/` nicht aus, und WordPress wird von hier aus nicht angefasst
(Default D12) — das Einsetzen der Landingpage macht Eric bzw. Claude.ai über
die REST-API.

| Datei | Was es ist |
|---|---|
| `PLAN.md` | Acht-Wochen-Plan mit Zielzahlen und Reihenfolge |
| `textbausteine.md` | Je Kanal drei Längen (300/800/1.500 Zeichen) + Anschreiben |
| `landingpage.html` | Blocksy-fertiger Block für `/ehrenamt-sitzwache` |
| `onboarding-mails.md` | Drei Mails: Willkommen → Checkliste → freigeschaltet |
| `flyer-a5.html` | Flyer A5 für Angehörige und Interessierte |
| `aushang-sana-a4.html` | A4-Aushang, an Klinikpersonal gerichtet |

## Flyer drucken

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=flyer-a5.pdf flyer-a5.html

grep -c /SMask flyer-a5.pdf     # MUSS 0 sein
qlmanage -p flyer-a5.pdf        # und einmal wirklich ansehen
```

Beim Drucken muss eine **Internetverbindung** bestehen: Schrift und QR-Code
kommen aus dem Netz. Der QR-Code entsteht aus der URL im `<script>` am
Dateiende — dadurch können Code und gedruckte Adresse nicht auseinanderlaufen.

**Keine `box-shadow` ergänzen.** Chrome exportiert Schatten als Soft-Mask,
Vorschau und Keynote malen daraus harte graue Kästen — und der
Chrome-Screenshot zeigt den Fehler nicht. Deshalb die `grep`-Prüfung oben.

## Zwei Regeln, die nicht verhandelbar sind

1. **Charité und St. Hedwig werden nicht genannt.** Keine bestätigten Partner.
   Nur Sana Klinikum Lichtenberg.
2. **Keine Zahl zum Freibetrag ohne Prüfung.** Der aktuelle Betrag nach
   § 3 Nr. 26a EStG steht in `beleg-vorlage.js` (`FREIBETRAG['26a']`) — von dort
   nehmen, nicht aus dem Gedächtnis. Im Material steht deshalb nur der
   Paragraf, keine Summe.

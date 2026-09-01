# Akquise Sitzwachen — acht Wochen

**Stand 01.09.2026.** Ziel: **15 Meldungen → 8 Infogespräche → 5 freigeschaltete
Ehrenamtliche bis Ende Oktober 2026.**

## Warum acht Wochen und nicht vier

Zwischen „Ich habe Interesse" und dem ersten Dienst liegen **4 bis 6 Wochen**:
erweitertes Führungszeugnis (2–3 Wochen Bearbeitungszeit beim Bürgeramt), fünf
Compliance-Dokumente, Einführung. Wer erst anfängt, wenn die Kapazitätsampel rot
ist, hat sechs Wochen Unterdeckung vor sich. **Bei Gelb anfangen.**

## Wochenplan

| Woche | Kanal | Aufwand | Erwartung |
|---|---|---|---|
| 1 | Landingpage live, Formular verlinkt von allen acht Ehrenamt-Seiten | halber Tag | Grundlage, 0–1 Meldungen |
| 1–2 | **Hospizdienste** in Lichtenberg und Umgebung anschreiben | 2 h | 2–4 Meldungen |
| 2 | vostel.de + GoVolunteer eintragen | 1,5 h | 2–3 Meldungen |
| 3 | bürgeraktiv.berlin + Landesfreiwilligenagentur | 1 h | 1–2 Meldungen |
| 3–4 | Freiwilligenagentur Lichtenberg, persönlich vorbeigehen | 2 h | 1–2 Meldungen |
| 4 | **Aushang im Sana** (Anfrage über Eric an die Pflegedirektion) | 1 h + Wartezeit | 2–4 Meldungen |
| 5 | Pflegeschulen: ASH, EHB, Charité-Gesundheitsakademie | 2 h | 2–3 Meldungen |
| 6 | Nachbarschaftshäuser + Stadtteilzentren Lichtenberg | 2 h | 1–2 Meldungen |
| 7 | Kirchengemeinden (Gemeindebriefe haben lange Vorlauffristen — **schon in Woche 3 anfragen**) | 1,5 h | 1–2 Meldungen |
| 8 | Nachfassen bei allen Meldungen ohne Antwort, Bilanz | 2 h | — |

## Reihenfolge ist nicht beliebig

**Hospizdienste zuerst.** Hospizbegleiter:innen bringen genau das Profil mit, das
eine Sitzwache braucht: Aushalten, Dasein, Nichtstun-Können. Sie sind geschult,
haben ein Führungszeugnis und wissen, worauf sie sich einlassen. Die
Abbruchquote dürfte dort am niedrigsten sein — der Kanal mit dem besten
Verhältnis von Aufwand zu einsatzbereiten Menschen.

**Portale in der Mitte.** vostel und GoVolunteer bringen Reichweite, aber auch
Menschen, die sich zehn Angebote ansehen und keins verfolgen. Rechne mit einer
niedrigen Übernahmequote.

**Sana-Aushang ist der Sonderfall.** Wer im Krankenhaus arbeitet, kennt die Lage
auf Station. Die Anfrage läuft über Eric an die Pflegedirektion, nicht über die
Abteilungsleitungen — das ist eine Hausentscheidung.

## Was gemessen wird

`ehrenamt_quellen()` im Vorstandsbereich zeigt je Quelle **Meldungen** und
**Übernommene**. Die zweite Zahl entscheidet. Ein Kanal mit 8 Meldungen und 0
Übernahmen ist schlechter als einer mit 2 Meldungen und 2 Übernahmen — und nach
acht Wochen wird nach dieser Zahl entschieden, was wiederholt wird.

Jeder Kanal bekommt ein eigenes `?src=`:
`?src=hospiz`, `?src=vostel`, `?src=govolunteer`, `?src=buergeraktiv`,
`?src=fa-lichtenberg`, `?src=flyer-sana`, `?src=pflegeschule`,
`?src=nachbarschaft`, `?src=kirche`.

Empfehlungen von Ehrenamtlichen laufen über `?ref=<code>` aus dem eigenen Profil.

## Was NICHT passiert

- **Charité und St. Hedwig werden nicht genannt.** Keine bestätigten Partner.
  Nur Sana darf als Partner auftauchen.
- **Keine Zahl zum Freibetrag ohne Prüfung.** Der Freibetrag nach § 3 Nr. 26a
  EStG steht in `beleg-vorlage.js` (`FREIBETRAG['26a']`) — von dort nehmen, nicht
  aus dem Gedächtnis.
- **Keine Versprechen zur Vergütung im Werbematerial.** Die Pauschale ist eine
  Aufwandsentschädigung, kein Lohn. Wer mit Geld wirbt, bekommt Menschen, die
  wegen des Geldes kommen — und die bleiben nicht.

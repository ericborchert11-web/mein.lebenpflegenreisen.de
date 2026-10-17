# Vereinsauslagen Stufe 2: Mitglieder reichen selbst ein — Design

Stand 17.10.2026. Eric hat freie Hand gegeben („so viel es geht alleine“);
die Entscheidungen unten sind deshalb Vorschläge, die mit der Abnahme
bestätigt werden. Rechte und Tests stehen lokal unter `sql/`.

Baut auf Stufe 1 auf (`2026-10-17-vereinsauslagen-design.md`).

## Ablauf

1. Unter **„Meine Anträge“** (`abrechnung.html`) gibt es den Knopf
   **„Auslage einreichen“**.
2. Das Mitglied trägt ein: wofür, Betrag, Datum (optional bis), optional eine
   Reise, an der es bestätigt teilgenommen hat, Anmerkung, **mindestens einen
   Beleg** (PDF oder Foto), zwei Bestätigungen (tatsächlich für den Verein
   entstanden und nicht anderweitig erstattet; Aufbewahrung).
3. Technisch: Entwurf anlegen → Belege hochladen → einreichen. Erst das
   Einreichen setzt „eingereicht“ und löst die Eingangsmeldung an finanzen@
   aus — die Meldung nennt die Zahl der Belege.
4. Bleibt ein Entwurf hängen (Upload abgebrochen), steht er unter „Meine
   Anträge“ mit **„Fortsetzen“**.
5. Der Vorstand gibt in „Auszahlungen“ frei oder lehnt ab, wie jeden Antrag.

## Entscheidungen

- **Beleg ist Pflicht** beim Selbstantrag (beim Vorstand freiwillig, siehe
  Stufe 1).
- **IBAN ist Pflicht**, wie bei Pauschalen.
- **Reise nur aus den eigenen bestätigten Anmeldungen**, sonst „keine Reise“.
- Keine Obergrenze für den Betrag; der Vorstand prüft jeden Antrag.
- Mitglieder sehen die Belege ihrer eigenen Anträge, löschen können sie nur
  im Entwurf.

## Schutz der Antragstabelle

Mit dem Selbstantrag wird die Antragstabelle für Mitglieder zur
Schreibfläche. Deshalb gilt ab Stufe 2 für Mitglieder: Anträge nur für sich
selbst und nur als „eingereicht“ oder Entwurf; Felder der Freigabe, der
Auszahlung und des Mailversands bleiben dem Vorstand und dem System
vorbehalten; bestehende Anträge ändern oder löschen nur der Vorstand.
Bestehende Abläufe (Reise- und Sitzwachen-Antrag) laufen unverändert.

## Tests

SQL-Test mit Rollenwechsel (Mitglied, zweites Mitglied, Vorstand) und
Selbstprüfung; Browser-Abnahme durch Eric mit einem Testmitglied oder einer
echten Auslage (z. B. Tinas Kaufbeleg).

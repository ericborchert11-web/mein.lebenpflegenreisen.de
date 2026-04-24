# 🚀 Setup-Anleitung — LPR App auf GitHub Pages

Damit `mein.lebenpflegenreisen.de` live geht. Schritt für Schritt.

---

## Schritt 1: GitHub-Repo anlegen (3 Minuten)

1. Gehe auf https://github.com/new
2. **Repository name:** `lpr-app`
3. **Owner:** `ericborchert11-web` (dein Account)
4. **Public** auswählen (für Free GitHub Pages nötig)
5. **NICHT** „Add a README file" ankreuzen
6. Klick **„Create repository"**

---

## Schritt 2: Dateien hochladen (5 Minuten)

Du hast jetzt ein leeres Repo. Zwei Wege:

### Weg A — Über Web-Upload (einfachster Weg)

1. Im neuen Repo auf **„uploading an existing file"** klicken (der Link mitten auf der Seite)
2. **Alle Dateien aus dem ZIP** (ich liefere dir gleich ein ZIP) hier reinziehen
3. Unten: Commit-Message „Initial upload", dann **„Commit changes"**

### Weg B — Über Git lokal (wenn du Git-Tools hast)

```bash
git clone https://github.com/ericborchert11-web/lpr-app.git
cd lpr-app
# alle ZIP-Dateien hier reinkopieren
git add .
git commit -m "Initial upload"
git push origin main
```

---

## Schritt 3: GitHub Pages aktivieren (2 Minuten)

1. Im Repo auf **Settings** klicken (oben rechts)
2. Linke Seitenleiste: **Pages**
3. Bei „Source": **Deploy from a branch**
4. Branch: **main**, Ordner: **/ (root)**
5. **Save**

→ Nach ~60 Sekunden steht oben grün:  
   `Your site is live at https://ericborchert11-web.github.io/lpr-app/`

**Erster Test:** Die URL im Browser öffnen — du solltest die grüne Willkommens-Seite sehen.

---

## Schritt 4: Custom Domain bei Ionos einrichten (5 Minuten + Wartezeit)

**Deine Frage war: „Ist das da Schulungsportal.lebenpflegenreisen.de?"**

Du kannst den Namen frei wählen. Mein Vorschlag:
- **`mein.lebenpflegenreisen.de`** (kurz, klar, offen für mehr als nur Schulung)

Anderes funktioniert auch — `portal.`, `mitwirkende.`, `intern.` — aber `app.` ist am neutralsten und wird oft für solche Zwecke verwendet.

### Bei Ionos:

1. Bei Ionos einloggen → **Domains & SSL** → `lebenpflegenreisen.de` auswählen
2. Reiter **DNS**
3. **Eintrag hinzufügen** → Typ **CNAME**
4. **Hostname:** `mein`
5. **Zeigt auf:** `ericborchert11-web.github.io` (ohne `https://`, ohne `/lpr-app`)
6. TTL: auf Standard (z.B. 3600) lassen
7. **Speichern**

### In GitHub (nach DNS-Eintrag):

1. Zurück ins GitHub-Repo → **Settings → Pages**
2. Unter „Custom domain" eingeben: `mein.lebenpflegenreisen.de`
3. **Save**
4. Ein paar Minuten warten — GitHub prüft den DNS-Eintrag
5. Wenn alles grün wird: **„Enforce HTTPS"** ankreuzen

**Achtung:** DNS-Änderungen brauchen **15 Minuten bis zu 24 Stunden**, um weltweit zu greifen. In der Zwischenzeit funktioniert aber die `ericborchert11-web.github.io/lpr-app/`-URL schon. Wir können Tester zunächst dorthin schicken und später auf die schöne URL umstellen.

---

## Schritt 5: Erster Test — in 3 Minuten

Nach dem Upload (egal ob mit oder ohne Custom Domain):

1. Öffne `https://ericborchert11-web.github.io/lpr-app/` im Browser
2. Die grüne Willkommens-Seite erscheint
3. Klick „Jetzt starten →"
4. Klick „Zurücksetzen & Demo-Daten laden"
5. Klick auf einen Demo-User (z.B. „margarete")
6. Du bist im Mitwirkenden-Bereich

Wenn das funktioniert: **der Test-Bereich ist live**. 🎉

---

## Schritt 6: Tester einladen (optional, dauert 5 Minuten)

Textvorschlag für WhatsApp/E-Mail:

> Hi, ich baue gerade die App für meinen Verein „Leben Pflegen Reisen e.V." und brauche dein Feedback.
>
> Es ist ein kleiner Prototyp — klick dich einfach 10 Minuten durch:
>
> 👉 https://mein.lebenpflegenreisen.de
>
> Keine Vorbereitung nötig, die Anleitung ist oben auf der Seite. Wichtig: Alles was du dort eingibst bleibt nur in deinem Browser — niemand sieht das.
>
> Danach hätte ich gerne 2-3 Sätze zurück: Was hat dich gestört, was fandst du gut? Danke dir!

---

## Häufige Probleme & Lösungen

### „404 Page not found"
- Noch 1-2 Minuten warten nach dem ersten Upload
- In Repo-Settings prüfen ob Pages wirklich auf `main` / `/ (root)` steht

### Custom Domain greift nicht
- DNS propagiert manchmal Stunden
- Test: https://dnschecker.org/ eingeben, dann `mein.lebenpflegenreisen.de` prüfen
- Wenn GitHub Pages in Settings „Domain not properly configured" zeigt: nochmal 15 Min warten, dann neu prüfen

### CSS lädt nicht
- Stelle sicher dass `shared.css` im Repo-Root liegt, nicht in einem Unterordner
- Browser-Cache löschen (Strg+F5)

---

## Was danach kommt (nicht heute)

Wenn die Tester Feedback geben, arbeiten wir das in den Prototyp ein — einfach neue Version in GitHub pushen, GitHub Pages deployt automatisch.

Später (nach den Tests):
- Google-Sheets-Backend anschließen für Multi-User-Betrieb
- Registrierung mit Admin-Freigabe
- Echter Chatbot mit Server-Proxy (dann ist WordPress als Host dafür dran)

---

**Wenn irgendein Schritt klemmt: einfach kurz Bescheid geben, dann fixen wir das zusammen.**

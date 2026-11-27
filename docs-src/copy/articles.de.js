// Ratgeber-Artikel (deutsch). Platzhalter im Text:
//   [[shot:name]]            Screenshot (siehe `shots` in de.js)
//   {{article:slug}}         Adresse eines anderen Artikels
//   {{guide:slug}}           Adresse einer Anleitung
//   {{download}}             Direktlink zur EXE, {{release}} die Release-Seite
// `faq` erscheint am Ende des Artikels und als strukturierte Daten für Suchmaschinen.

module.exports = [
    {
        slug: "kostenlose-notiz-app-windows",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Kostenlose Notiz-App für Windows: verschlüsselt, offline | Mumbin",
        title: "Kostenlose Notiz-App für Windows: verschlüsselt, offline und ohne Konto",
        description: "Mumbin ist eine kostenlose Notiz-App für Windows: ohne Konto, ohne Installation, offline und mit starker Verschlüsselung. Das kann sie und so startest du.",
        lead: "Eine Notiz-App soll schnell sein, Ordnung halten und deine Gedanken schützen. Mumbin bringt das in einer einzigen portablen Datei mit – kostenlos und ohne Anmeldung.",
        card: "Was Mumbin als kostenlose Notiz-App für Windows kann – und wie du in drei Schritten startest.",
        related: ["notizen-ohne-cloud", "wie-sicher-ist-mumbin", "anwendungsfaelle"],
        faq: [
            ["Ist Mumbin wirklich kostenlos?", "Ja. Du kannst Mumbin kostenlos herunterladen und nutzen, privat und intern in einem Unternehmen. Der Quellcode ist öffentlich einsehbar; die genauen Bedingungen stehen in der Lizenzdatei auf GitHub."],
            ["Brauche ich ein Konto oder eine Anmeldung?", "Nein. Es gibt kein Konto und keine Anmeldung. Du startest die EXE, wählst einen Ordner für dein Notizbuch und schreibst los."],
            ["Warum zeigt Windows beim ersten Start eine Warnung?", "Die EXE ist nicht digital signiert, deshalb kann Windows einen Hinweis anzeigen. Du kannst die SHA-256-Prüfsumme der heruntergeladenen Datei mit dem Wert auf der Release-Seite vergleichen und so sicherstellen, dass sie unverändert ist."],
        ],
        body: `
<h2>Das bringt eine gute Notiz-App mit</h2>
<p>Wer Notizen digital führt, möchte vor allem drei Dinge: sie schnell festhalten, später wiederfinden und sicher sein, dass sie privat bleiben. Mumbin ist genau darauf zugeschnitten. Es ist eine Notiz-App für Windows 10 und 11, die auf deinem Rechner läuft und deine Texte als Dateien in einem Ordner ablegt, den du selbst wählst.</p>
[[shot:overview]]

<h2>Die wichtigsten Funktionen im Überblick</h2>
<ul>
  <li><strong>Schreiben mit Formatierung:</strong> Überschriften, Listen, Tabellen, Bilder und Code erscheinen sofort so, wie sie gemeint sind.</li>
  <li><strong>Verknüpfen:</strong> Seiten stehen in einem Baum und verweisen aufeinander; Rückverweise zeigen, wo eine Seite noch vorkommt.</li>
  <li><strong>Finden:</strong> Die Suche durchsucht Titel und Text und zeigt zu jedem Treffer eine Vorschau.</li>
  <li><strong>Aufgaben:</strong> Ein Kästchen in der Notiz genügt, die Aufgabenübersicht sammelt alle – auf Wunsch mit Beginn und Frist.</li>
  <li><strong>Verschlüsseln:</strong> pro Seite, mit einem gemeinsamen Tresor oder als versiegeltes Notizbuch. Mehr dazu in der Anleitung {{guideLink:notizen-verschluesseln}}.</li>
  <li><strong>Anhänge:</strong> PDFs, Scans, Tabellen und beliebige andere Dateien legst du direkt an der Seite ab.</li>
</ul>

<h2>Ohne Konto, ohne Installation</h2>
<p>Mumbin besteht aus einer einzigen EXE-Datei von rund 4,3 Megabyte. Es gibt keinen Installationsassistenten und kein Benutzerkonto. Deine Einstellungen speichert das Programm im Ordner <code>mumbin_data</code> neben der EXE, nicht in der Registrierung von Windows. Dadurch lässt sich alles auch auf einem USB-Stick mitnehmen. Mehr zu diesem Vorteil steht im Artikel <a class="text-link" href="{{article:portable-notiz-app-usb-stick}}">Portable Notiz-App</a>.</p>

<h2>In drei Schritten starten</h2>
<ol>
  <li><strong>Herunterladen:</strong> Lade <a class="text-link" href="{{download}}">mumbin.exe</a> herunter und lege sie in einen beschreibbaren Ordner.</li>
  <li><strong>Starten:</strong> Beim ersten Start wählst du den Ordner für dein Notizbuch. Fehlt die Microsoft Edge WebView2 Runtime, die auf vielen Windows-PCs bereits vorhanden ist, installierst du sie einmalig.</li>
  <li><strong>Loslegen:</strong> Schreibe deine erste Seite, verknüpfe sie mit einer zweiten und schütze, was privat bleiben soll.</li>
</ol>

<h2>Für wen eignet sich Mumbin?</h2>
<p>Mumbin passt zu allen, die persönlich unter Windows arbeiten und ihre Notizen lokal und geschützt aufbewahren möchten: zum Lernen und Recherchieren, für Projekte, Reisen, Tagebuch und Wissenssammlungen. Konkrete Ideen findest du im Artikel <a class="text-link" href="{{article:anwendungsfaelle}}">Anwendungsfälle im Alltag</a>.</p>
`,
    },
    {
        slug: "notizen-ohne-cloud",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Notizen ohne Cloud speichern: Vorteile und Einrichtung | Mumbin",
        title: "Notizen ohne Cloud speichern: lokal, offline und unter deiner Kontrolle",
        description: "Notizen lokal statt in der Cloud speichern: Das sind die Vorteile von Offline-Notizen, und so richtest du es mit Mumbin ein – ohne Konto und ohne Telemetrie.",
        lead: "Deine Notizen liegen als Dateien auf deinem Rechner, nicht auf fremden Servern. Das macht sie schnell, jederzeit verfügbar und vollständig deine Sache.",
        card: "Warum lokale Notizen praktisch sind, was du gewinnst und wie du mit Mumbin ohne Cloud arbeitest.",
        related: ["notizen-gehoeren-dir", "portable-notiz-app-usb-stick", "wie-sicher-ist-mumbin"],
        faq: [
            ["Sendet Mumbin Notizen an einen Server?", "Nein. Mumbin hat keine Cloud-Anbindung, kein Konto und keine Telemetrie. Deine Notizen verlassen deinen Rechner nur, wenn du sie selbst weitergibst."],
            ["Funktioniert Mumbin ohne Internet?", "Ja. Alle Funktionen laufen offline. Eine Internetverbindung brauchst du nur, um die EXE herunterzuladen oder Links zu öffnen, die du bewusst anklickst."],
            ["Wie sichere ich lokale Notizen?", "Ein Notizbuch ist ein gewöhnlicher Ordner. Du kopierst ihn auf eine externe Festplatte, einen USB-Stick oder in ein Backup-Programm deiner Wahl."],
        ],
        body: `
<h2>Was „ohne Cloud“ bedeutet</h2>
<p>Bei einer lokalen Notiz-App liegen deine Texte auf deiner eigenen Festplatte. Nichts wird automatisch hochgeladen, und es braucht weder ein Benutzerkonto noch eine Internetverbindung. Mumbin arbeitet genau so: Jedes Notizbuch ist ein Ordner mit Textdateien, den du selbst auswählst.</p>

<h2>Das gewinnst du mit lokalen Notizen</h2>
<ul>
  <li><strong>Kontrolle:</strong> Du entscheidest, wo die Dateien liegen, wer sie sieht und wann sie gelöscht werden.</li>
  <li><strong>Tempo:</strong> Es gibt keine Wartezeit auf Server. In einem Beispiel-Notizbuch mit 2.000 Seiten findet die Volltextsuche in rund 51 Millisekunden.</li>
  <li><strong>Verfügbarkeit:</strong> Deine Notizen sind im Zug, im Flugzeug und bei Netzausfall genauso da wie sonst.</li>
  <li><strong>Privatsphäre:</strong> Ohne Konto und ohne Telemetrie gibt es keine Nutzungsdaten, die irgendwo anfallen.</li>
  <li><strong>Einfachheit:</strong> Keine Abos, keine Anmeldung, keine Synchronisierungsfehler.</li>
</ul>
[[shot:search]]

<h2>So arbeitest du mit Mumbin lokal</h2>
<ol>
  <li>Starte die portable EXE und wähle einen Ordner, zum Beispiel unter <em>Dokumente</em>.</li>
  <li>Schreibe deine Seiten. Mumbin speichert sie als Textdateien in diesem Ordner, Anhänge liegen in Ordnern daneben.</li>
  <li>Schütze vertrauliche Seiten mit einem eigenen Passwort oder dem Tresor. Alles Weitere steht in der Anleitung {{guideLink:notizen-verschluesseln}}.</li>
  <li>Sichere den Ordner regelmäßig, wie du es mit anderen wichtigen Dateien auch tust.</li>
</ol>

<h2>Lokal und trotzdem überall dabei</h2>
<p>Lokal heißt nicht, an einen Rechner gebunden zu sein. Kopiere den Notizbuchordner samt EXE auf einen USB-Stick oder gleiche ihn mit einem Dateisync-Dienst deiner Wahl ab. So nimmst du deine Notizen mit, ohne dass Mumbin ein Konto verlangt. Die Details stehen in der Anleitung {{guideLink:notizbuch-mitnehmen}}.</p>

<h2>Datenschutz von Anfang an</h2>
<p>Weil die App keine Daten an Dritte sendet, entstehen gar nicht erst Fragen danach, wo deine Notizen liegen oder wer Zugriff hat. Die Oberfläche lädt keine Fremdinhalte und blockiert externe Anfragen. Wie das Zusammenspiel von Verschlüsselung und Programm aufgebaut ist, erklärt der Artikel <a class="text-link" href="{{article:wie-sicher-ist-mumbin}}">Wie sicher ist Mumbin?</a></p>
`,
    },
    {
        slug: "wie-sicher-ist-mumbin",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "Wie sicher ist Mumbin? Verschlüsselung einfach erklärt",
        title: "Wie sicher ist Mumbin? Die Verschlüsselung einfach erklärt",
        description: "Argon2id, XChaCha20-Poly1305 und kein Zugriff ohne Passwort: So schützt Mumbin deine Notizen, und so hältst du die Sicherheit mit einfachen Gewohnheiten hoch.",
        lead: "Mumbin schützt Notizen mit bewährten, offen dokumentierten Verfahren. Hier erfährst du verständlich, was dahintersteckt und wie du das Beste daraus machst.",
        card: "Argon2id, XChaCha20-Poly1305, Tresor und Versiegelung verständlich erklärt – und woran du die Sicherheit erkennst.",
        related: ["notizen-gehoeren-dir", "vertrauliche-notizen-beruf", "digitales-tagebuch-verschluesselt"],
        faq: [
            ["Welche Verschlüsselung nutzt Mumbin?", "Mumbin leitet den Schlüssel mit Argon2id aus deinem Passwort ab und verschlüsselt die Inhalte mit XChaCha20-Poly1305. Beide Verfahren stammen aus der Kryptografiebibliothek libsodium und gelten als modern und gut untersucht."],
            ["Gibt es eine Hintertür oder Passwort-Wiederherstellung?", "Nein. Das Passwort gehört nur dir. Deshalb gibt es keine Hintertür, und niemand außer dir kann geschützte Seiten öffnen. Bewahre dein Passwort sicher auf."],
            ["Kann ich die Verschlüsselung selbst nachprüfen?", "Ja. Der Quellcode ist öffentlich einsehbar, und das Format steht im Kopf des unabhängigen Python-Werkzeugs, das geschützte Inhalte mit deinem Passwort auch ohne Mumbin öffnet."],
        ],
        body: `
<h2>Das Prinzip in einem Satz</h2>
<p>Dein Passwort wird zu einem starken Schlüssel verarbeitet, und mit diesem Schlüssel werden deine Seiten und Anhänge so verschlüsselt, dass sie ohne das Passwort wie zufällige Daten aussehen.</p>

<h2>Die Bausteine</h2>
<ul>
  <li><strong>Argon2id</strong> leitet aus deinem Passwort den Schlüssel ab. Das Verfahren ist absichtlich rechenaufwendig und speicherhungrig, damit Raten im großen Stil mühsam wird.</li>
  <li><strong>XChaCha20-Poly1305</strong> verschlüsselt die Inhalte. Es ist ein authentifiziertes Verfahren: Verändert jemand eine verschlüsselte Datei, fällt das beim Entschlüsseln auf.</li>
  <li><strong>Eine geprüfte Bibliothek:</strong> Beide Verfahren kommen aus libsodium, einer weit verbreiteten und gut geprüften Kryptografiebibliothek.</li>
</ul>

<h2>Drei Schutzarten für unterschiedliche Bedürfnisse</h2>
<p>Du wählst, wie viel Schutz du brauchst:</p>
<ul>
  <li><strong>Eigenes Passwort pro Seite:</strong> getrennter Zugang für einzelne Seiten samt ihren Anhängen.</li>
  <li><strong>Tresor:</strong> Eine Passphrase schützt alle Seiten, die du dem Tresor übergibst.</li>
  <li><strong>Versiegeltes Notizbuch:</strong> Alles ist verschlüsselt, auch die Namen der Seiten und Anhänge auf der Festplatte.</li>
</ul>
[[shot:protect-menu]]
<p>Die Schritte für jede Variante zeigt die Anleitung {{guideLink:notizen-verschluesseln}}.</p>

<h2>Gesperrt heißt wirklich gesperrt</h2>
<p>Eine gesperrte Seite zeigt nur den Knopf zum Entsperren. Solange sie gesperrt ist, hält Mumbin keine Schlüssel im Speicher. Gesperrte Inhalte tauchen bewusst weder in der Suche noch in der Aufgabenübersicht oder im Export auf. Die automatische Sperre schließt geöffnete Seiten nach einer Leerlaufzeit, die du einstellst.</p>
[[shot:locked]]

<h2>Offen und nachprüfbar</h2>
<p>Vertrauen entsteht durch Nachprüfbarkeit. Der Quellcode von Mumbin ist öffentlich einsehbar, automatische Tests prüfen Verschlüsselung und Angriffe auf Dateinamen, und ein unabhängiges Python-Werkzeug entschlüsselt dein Notizbuch mit dem richtigen Passwort auch ohne Mumbin. So bist du nicht von einem einzigen Programm abhängig.</p>

<h2>So holst du das Beste heraus</h2>
<ul>
  <li>Wähle ein langes Passwort oder eine Passphrase aus mehreren Wörtern. Für Seitenpasswörter verlangt Mumbin mindestens zehn Zeichen.</li>
  <li>Verwende für dein Notizbuch ein Passwort, das du nirgendwo sonst nutzt.</li>
  <li>Bewahre das Passwort sicher auf, zum Beispiel in einem Passwortmanager.</li>
  <li>Sichere den Notizbuchordner regelmäßig; das geht auch bei verschlüsselten Notizbüchern mit einem einfachen Kopieren.</li>
  <li>Wenn du Inhalte exportierst, werden entsperrte Seiten im Klartext ausgegeben. Gib Exporte bewusst weiter.</li>
</ul>
`,
    },
    {
        slug: "anwendungsfaelle",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "Wofür nutzt man Mumbin? 9 Anwendungsfälle aus dem Alltag",
        title: "Wofür nutzt man Mumbin? Neun Anwendungsfälle aus dem Alltag",
        description: "Von Tagebuch über Studium bis Projektplanung: Neun Anwendungsfälle zeigen, wie du mit Mumbin Notizen, Dokumente und Aufgaben verknüpfst und sicher aufbewahrst.",
        lead: "Mumbin hält Texte, Dateien, Tabellen und Aufgaben zusammen. Diese neun Einsatzmöglichkeiten zeigen, wie vielseitig das im Alltag ist.",
        card: "Tagebuch, Studium, Reisen, Projekte, Unterlagen und mehr: So setzt du Mumbin im Alltag ein.",
        related: ["wissensdatenbank-aufbauen", "digitales-tagebuch-verschluesselt", "vertrauliche-notizen-beruf"],
        faq: [
            ["Kann ich Dateien wie PDFs in Mumbin ablegen?", "Ja. Beliebige Dateien legst du als Anhänge an einer Seite ab, zum Beispiel PDFs, Scans oder Tabellenkalkulationen. Sie bleiben im Ordner deines Notizbuchs und lassen sich mit der Seite zusammen verschlüsseln."],
            ["Kann ich mehrere Notizbücher führen?", "Ja. Du wechselst mit einem Klick zwischen Notizbüchern, und jedes liegt in seinem eigenen Ordner mit eigenen Einstellungen."],
        ],
        body: `
<h2>1. Ein digitales Tagebuch führen</h2>
<p>Schreibe jeden Tag eine Seite und schütze sie mit einem eigenen Passwort oder lege gleich ein versiegeltes Notizbuch an. Tags wie <code>@dankbar</code> oder <code>@idee</code> ordnen Einträge quer zur Datumsreihenfolge. Mehr dazu im Artikel <a class="text-link" href="{{article:digitales-tagebuch-verschluesselt}}">Digitales Tagebuch verschlüsselt führen</a>.</p>

<h2>2. Lernen und Studieren</h2>
<p>Lege je Fach eine Seite mit Unterseiten für Vorlesungen an, verlinke Begriffe untereinander und nutze die Rückverweise, um Zusammenhänge zu sehen. Die Suche findet Definitionen in Sekunden, und Aufgaben mit Frist erinnern dich an Abgaben.</p>

<h2>3. Reisen planen</h2>
<p>Sammle Reiseziele, Buchungsbestätigungen als PDF, Packlisten und Tagespläne in einer Seite pro Reise. Bilder ziehst du einfach in die Seite. Unterwegs ist alles offline verfügbar.</p>

<h2>4. Projekte und Aufgaben im Blick behalten</h2>
<p>Schreibe Aufgaben direkt in die Projektnotiz. Die Aufgabenübersicht sammelt alle offenen, aktiven und fälligen Punkte und gruppiert sie nach Notiz. Beginn und Frist setzt du bequem per Datumswähler. Die Schritte stehen in der Anleitung {{guideLink:aufgaben-mit-frist}}.</p>
[[shot:tasks]]

<h2>5. Wichtige Unterlagen ordnen</h2>
<p>Verträge, Rechnungen und Bescheinigungen lassen sich als Anhänge an einer Seite sammeln. Mit einem Tresor oder einem versiegelten Notizbuch bleiben auch die Dateinamen verborgen.</p>

<h2>6. Eine Wissenssammlung aufbauen</h2>
<p>Halte Gelerntes, Rezepte, Anleitungen oder Fundstücke fest und verbinde sie mit Links und Tags. Wie daraus ein persönliches Wissensnetz wird, zeigt der Artikel <a class="text-link" href="{{article:wissensdatenbank-aufbauen}}">Persönliche Wissensdatenbank aufbauen</a>.</p>

<h2>7. Recherche und Ideen sammeln</h2>
<p>Für Artikel, Abschlussarbeiten oder Gestaltungsideen legst du Quellen, Zitate und Bilder an einer Stelle ab. Die Suche mit Wortgruppen, Ausschlüssen und Tags hilft beim Wiederfinden.</p>

<h2>8. Vertrauliche Arbeitsnotizen</h2>
<p>Gesprächsnotizen, Entwürfe und Kundeninformationen bleiben lokal und lassen sich mit eigenem Passwort pro Seite trennen. Hintergründe stehen in <a class="text-link" href="{{article:vertrauliche-notizen-beruf}}">Vertrauliche Notizen im Beruf</a>.</p>

<h2>9. Notizen mitnehmen</h2>
<p>Ein Notizbuch ist ein Ordner: Kopiere ihn samt EXE auf einen USB-Stick und arbeite an einem anderen PC weiter. Mehr dazu im Artikel <a class="text-link" href="{{article:portable-notiz-app-usb-stick}}">Portable Notiz-App</a>.</p>

<h2>Fang klein an</h2>
<p>Du brauchst keinen großen Plan. Eine Seite genügt als Start, alles Weitere wächst mit. <a class="text-link" href="{{download}}">Lade Mumbin herunter</a> und probiere den Anwendungsfall aus, der dich am meisten reizt.</p>
`,
    },
    {
        slug: "wissensdatenbank-aufbauen",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "Persönliche Wissensdatenbank aufbauen: Links, Tags, Suche",
        title: "Eine persönliche Wissensdatenbank aufbauen: mit Rückverweisen, Tags und Suche",
        description: "So wächst aus losen Notizen eine persönliche Wissensdatenbank: Seiten verknüpfen, Rückverweise nutzen, mit Tags ordnen und alles in Sekunden wiederfinden – lokal in Mumbin.",
        lead: "Eine Wissensdatenbank besteht aus kleinen, verknüpften Notizen. Mit Seitenbaum, Rückverweisen und Tags wird aus deiner Sammlung ein Netz, in dem du dich schnell zurechtfindest.",
        card: "Seiten verlinken, Rückverweise nutzen, mit Tags ordnen und blitzschnell suchen: so entsteht ein Wissensnetz.",
        related: ["anwendungsfaelle", "notizen-gehoeren-dir", "kostenlose-notiz-app-windows"],
        faq: [
            ["Was sind Rückverweise?", "Ein Rückverweis zeigt dir bei jeder Seite, welche anderen Seiten auf sie verlinken. So entdeckst du Zusammenhänge, die du beim Schreiben noch nicht im Kopf hattest."],
            ["Brechen Links, wenn ich Seiten umbenenne?", "Nein. Beim Umbenennen oder Verschieben führt Mumbin die Links mit, sodass Verweise intakt bleiben."],
        ],
        body: `
<h2>Was eine Wissensdatenbank ausmacht</h2>
<p>Viele kennen es: Gute Ideen stehen irgendwo, aber wo? Eine persönliche Wissensdatenbank löst das, indem sie Notizen nicht nur ablegt, sondern verbindet. Jede Seite behandelt ein Thema, und Links zeigen, wie die Themen zusammenhängen. Mumbin ist dafür gebaut, bleibt dabei aber ruhig und einfach.</p>

<h2>Schritt 1: Eine Struktur im Seitenbaum anlegen</h2>
<p>Seiten stehen in einem Baum mit Unterseiten. Beginne grob, zum Beispiel mit <em>Projekte</em>, <em>Wissen</em> und <em>Privat</em>, und lege darunter einzelne Themen an. Du kannst Seiten jederzeit umbenennen oder verschieben, ohne dass Verweise brechen.</p>
[[shot:overview]]

<h2>Schritt 2: Seiten miteinander verlinken</h2>
<p>Verlinke verwandte Seiten direkt im Text. Unter dem Seitenbaum zeigen Rückverweise bei jeder Seite, wer auf sie verweist. So wächst dein Wissen in beide Richtungen.</p>
[[shot:links]]

<h2>Schritt 3: Mit Tags quer ordnen</h2>
<p>Tags wie <code>@idee</code>, <code>@lesen</code> oder <code>@wichtig</code> ordnen Seiten unabhängig von ihrem Platz im Baum. Die Stichwort-Wolke zeigt dir, welche Themen bei dir wichtig sind.</p>
[[shot:tags]]

<h2>Schritt 4: Schnell wiederfinden</h2>
<p>Die Suche durchsucht Titel und Text. Mit Anführungszeichen findest du Wortgruppen, mit einem Minus schließt du Begriffe aus, mit <code>@Tag</code> oder einem Seitennamen grenzt du ein. Strg+J springt in Sekunden zu jeder Seite. Selbst in einem Beispiel-Notizbuch mit 2.000 Seiten liefert die Volltextsuche ihre Treffer in rund 51 Millisekunden.</p>

<h2>Schritt 5: Aufgaben und Anhänge dazunehmen</h2>
<p>Zu einem Thema gehören oft Aufgaben und Dateien. Beides legst du direkt an der Seite ab: Kästchen werden in der Aufgabenübersicht gesammelt, PDFs und Bilder bleiben als Anhänge dabei.</p>

<h2>Bleibt dein Wissen dein Wissen?</h2>
<p>Ja: Alles liegt lokal als Textdateien in einem Ordner. Wenn Seiten vertraulich sind, schützt du sie mit einem Passwort oder legst gleich ein versiegeltes Notizbuch an. Mehr dazu in der Anleitung {{guideLink:notizen-verschluesseln}}.</p>
`,
    },
    {
        slug: "digitales-tagebuch-verschluesselt",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Digitales Tagebuch verschlüsselt führen: Anleitung | Mumbin",
        title: "Digitales Tagebuch verschlüsselt führen: privat, offline und übersichtlich",
        description: "Ein digitales Tagebuch, das nur dir gehört: So führst du es mit Mumbin offline, übersichtlich und mit Passwort oder als komplett versiegeltes Notizbuch.",
        lead: "Ein Tagebuch ist persönlich. Mit einem versiegelten Notizbuch bleibt es das auch am Rechner: verschlüsselt, offline und nur mit deinem Passwort lesbar.",
        card: "So legst du ein verschlüsseltes Tagebuch an: offline, mit Passwort und auf Wunsch mit verborgenen Dateinamen.",
        related: ["wie-sicher-ist-mumbin", "anwendungsfaelle", "notizen-ohne-cloud"],
        faq: [
            ["Sind auch die Seitennamen eines Tagebuchs verschlüsselt?", "Ja, wenn du das Notizbuch beim Anlegen versiegelst. Dann sind jede Seite, jeder Anhang und sogar deren Namen auf der Festplatte verschlüsselt."],
            ["Kann ich nur einzelne Einträge schützen?", "Ja. Jede Seite kann ein eigenes Passwort bekommen. Du kannst offene und geschützte Seiten in einem Notizbuch mischen."],
        ],
        body: `
<h2>Warum ein digitales Tagebuch?</h2>
<p>Am Rechner schreibst du schneller, kannst Einträge durchsuchen und Fotos oder Dateien direkt dazulegen. Damit das Tagebuch trotzdem privat bleibt, braucht es Schutz, der zum Thema passt. Mumbin speichert alles lokal und bietet drei Schutzarten, von einzelnen Seiten bis zum komplett versiegelten Notizbuch.</p>

<h2>Die beste Variante: ein versiegeltes Notizbuch</h2>
<p>Beim Anlegen eines neuen Notizbuchs fragt Mumbin, ob du es mit einer Passphrase schützen möchtest. Wählst du das, ist alles verschlüsselt: jede Seite, jeder Anhang und sogar die Namen auf der Festplatte. Wer den Ordner öffnet, sieht nur unlesbare Dateien. Beim Start gibst du deine Passphrase ein, und das Tagebuch öffnet sich.</p>
[[shot:notebooks]]

<h2>Ein Eintrag pro Tag</h2>
<ol>
  <li>Lege eine Seite <em>Tagebuch</em> mit Unterseiten pro Jahr oder Monat an.</li>
  <li>Schreibe pro Tag eine Seite, zum Beispiel <code>2026-11-20</code>. Mit einer Seitenvorlage startet jeder Eintrag mit deinem gewohnten Aufbau.</li>
  <li>Ergänze Tags wie <code>@dankbar</code> oder <code>@ideen</code>, um Einträge später thematisch zu finden.</li>
  <li>Füge Fotos und andere Dateien als Anhänge hinzu.</li>
</ol>

<h2>Wiederfinden und Rückblick</h2>
<p>Die Suche findet Wörter und Wortgruppen in allen Einträgen. Die Stichwort-Wolke zeigt dir, welche Themen dich besonders beschäftigen. Wichtig: Gesperrte Seiten tauchen bewusst nicht in Treffern auf – solange das Tagebuch gesperrt ist, bleibt alles verborgen.</p>

<h2>Gute Gewohnheiten</h2>
<ul>
  <li>Wähle eine Passphrase, die du dir merken kannst und nirgendwo sonst nutzt.</li>
  <li>Bewahre sie sicher auf, denn es gibt keine Hintertür.</li>
  <li>Sichere den Notizbuchordner regelmäßig auf einem zweiten Datenträger.</li>
</ul>
<p>Wie die Verschlüsselung im Einzelnen funktioniert, erklärt der Artikel <a class="text-link" href="{{article:wie-sicher-ist-mumbin}}">Wie sicher ist Mumbin?</a> Die Schritte zum Einrichten findest du in der Anleitung {{guideLink:notizen-verschluesseln}}.</p>
`,
    },
    {
        slug: "portable-notiz-app-usb-stick",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Portable Notiz-App für den USB-Stick: Notizen mitnehmen",
        title: "Portable Notiz-App: Notizen auf dem USB-Stick und an mehreren PCs nutzen",
        description: "Eine portable Notiz-App ohne Installation: Mumbin und dein Notizbuch passen auf einen USB-Stick. So arbeitest du an mehreren Windows-PCs mit denselben Notizen.",
        lead: "Eine EXE und ein Ordner: Mehr braucht Mumbin nicht. Das macht deine Notizen beweglich – vom Schreibtisch zum Laptop, vom Büro nach Hause.",
        card: "Mumbin und dein Notizbuch auf den USB-Stick packen und überall weiterarbeiten, ganz ohne Installation.",
        related: ["notizen-ohne-cloud", "kostenlose-notiz-app-windows", "notizen-gehoeren-dir"],
        faq: [
            ["Muss Mumbin installiert werden?", "Nein. Mumbin ist eine portable EXE. Du legst sie in einen beschreibbaren Ordner und startest sie. Die Einstellungen liegen im Ordner mumbin_data daneben, nicht in der Registrierung."],
            ["Was brauche ich auf dem anderen PC?", "Windows 10 oder 11 und die Microsoft Edge WebView2 Runtime, die auf vielen Windows-PCs bereits vorhanden ist."],
            ["Kann ich denselben Notizbuchordner auf mehreren PCs synchronisieren?", "Ja. Du kannst den Ordner per USB-Stick kopieren oder mit einem Dateisync-Dienst deiner Wahl abgleichen. Öffne ihn dabei immer nur auf einem Rechner gleichzeitig."],
        ],
        body: `
<h2>Was „portabel“ bedeutet</h2>
<p>Eine portable Anwendung läuft ohne Installation direkt aus einem Ordner. Mumbin ist so gebaut: Die Datei <code>mumbin.exe</code> ist rund 4,3 Megabyte groß, die Einstellungen liegen im Ordner <code>mumbin_data</code> daneben. Du kannst beides zusammen auf einen USB-Stick legen und an jedem passenden Windows-PC starten.</p>

<h2>Dein Notizbuch ist ein Ordner</h2>
<p>Jedes Notizbuch liegt in einem Ordner. Ungeschützte Seiten sind einfache Textdateien, Anhänge liegen in Ordnern daneben. Dadurch lässt sich ein Notizbuch kopieren, sichern und verschieben wie jeder andere Ordner:</p>
<div class="code">Mein-Notizbuch/ ├─ notebook.mumbin ├─ Meine_Notizen.txt ├─ Island-Reise.txt └─ Island-Reise/aurora.png</div>

<h2>So nimmst du alles mit</h2>
<ol>
  <li>Schließe Mumbin oder warte, bis „gespeichert“ angezeigt wird.</li>
  <li>Kopiere den Notizbuchordner und die <code>mumbin.exe</code> samt Ordner <code>mumbin_data</code> auf den USB-Stick.</li>
  <li>Starte die EXE am anderen PC und öffne den Notizbuchordner.</li>
</ol>
<p>Die ausführliche Anleitung dazu steht unter {{guideLink:notizbuch-mitnehmen}}.</p>

<h2>Geschützt unterwegs</h2>
<p>Gerade auf einem USB-Stick lohnt sich Verschlüsselung. Verlierst du den Stick, sind Seiten mit Passwort ohne dieses Passwort nicht lesbar, und bei einem versiegelten Notizbuch bleiben sogar die Dateinamen verborgen. Eine Anleitung zu den Schutzarten findest du in der Anleitung {{guideLink:notizen-verschluesseln}}.</p>
[[shot:password]]

<h2>Mehrere PCs ohne Konto</h2>
<p>Statt eines Cloud-Kontos nutzt du, was du ohnehin hast: einen USB-Stick, eine externe Festplatte oder einen Dateisync-Dienst deiner Wahl. Mumbin verlangt keine Anmeldung und sendet keine Daten ins Internet. Weitere Vorteile lokaler Notizen beschreibt der Artikel <a class="text-link" href="{{article:notizen-ohne-cloud}}">Notizen ohne Cloud</a>.</p>
`,
    },
    {
        slug: "vertrauliche-notizen-beruf",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Vertrauliche Notizen im Beruf lokal verschlüsseln | Mumbin",
        title: "Vertrauliche Notizen im Beruf: Kundendaten und Entwürfe lokal schützen",
        description: "Gesprächsnotizen, Kundendaten und Entwürfe gehören geschützt: So hältst du berufliche Notizen mit Mumbin lokal, verschlüsselt und nach Passwörtern getrennt.",
        lead: "Berufliche Notizen enthalten oft Vertrauliches. Mit lokaler Speicherung und Verschlüsselung pro Seite bleibt die Kontrolle bei dir.",
        card: "Gesprächsnotizen und Kundendaten lokal speichern, pro Seite verschlüsseln und sauber getrennt aufbewahren.",
        related: ["wie-sicher-ist-mumbin", "notizen-ohne-cloud", "anwendungsfaelle"],
        faq: [
            ["Darf ich Mumbin im Unternehmen nutzen?", "Ja. Die Lizenz erlaubt die Nutzung des unveränderten Programms privat und intern in einem Unternehmen oder einer Organisation. Die genauen Bedingungen stehen in der Lizenzdatei auf GitHub."],
            ["Ersetzt Mumbin eine Datenschutzprüfung?", "Nein. Die Software hilft technisch, indem Notizen lokal bleiben und verschlüsselt werden können. Ob und wie du personenbezogene Daten verarbeiten darfst, richtet sich nach den Regeln deiner Organisation und des Gesetzes. Das ist keine Rechtsberatung."],
        ],
        body: `
<h2>Warum berufliche Notizen besonderen Schutz verdienen</h2>
<p>Besprechungsnotizen, Kundeninformationen, Angebotsentwürfe, interne Überlegungen: Vieles davon ist nur für dich oder dein Team gedacht. Wer Notizen lokal hält und gezielt verschlüsselt, behält die Kontrolle darüber, wo sie liegen und wer sie sehen kann.</p>

<h2>Lokal heißt: keine Weitergabe an Dritte</h2>
<p>Mumbin hat keine Cloud-Anbindung, kein Konto und keine Telemetrie. Deine Notizen verlassen den Rechner nur, wenn du sie selbst weitergibst. Die Oberfläche lädt keine Fremdinhalte und blockiert externe Anfragen. Das schafft eine einfache Ausgangslage, wenn du über den Umgang mit sensiblen Informationen nachdenkst.</p>

<h2>Ein Passwort pro Kunde oder Projekt</h2>
<p>Du kannst jeder Seite ein eigenes Passwort geben. Das ist praktisch, wenn Informationen verschiedener Kunden oder Projekte getrennt bleiben sollen. Anhänge wie Angebote oder Verträge werden mit der Seite zusammen verschlüsselt. Alternativ schützt der Tresor viele Seiten mit einer gemeinsamen Passphrase.</p>
[[shot:protect-menu]]

<h2>Alles verbergen: das versiegelte Notizbuch</h2>
<p>Wenn schon der Name einer Seite etwas verraten würde, etwa ein Kundenname, legst du ein versiegeltes Notizbuch an. Dann sind auch die Namen der Seiten und Anhänge auf der Festplatte verschlüsselt.</p>

<h2>Gute Praxis im Alltag</h2>
<ul>
  <li>Aktiviere die automatische Sperre, damit geöffnete Seiten nach einer Leerlaufzeit wieder geschlossen werden.</li>
  <li>Sichere den Notizbuchordner nach den Regeln deiner Organisation.</li>
  <li>Denke bei Exporten daran, dass entsperrte Seiten im Klartext erscheinen.</li>
  <li>Wende dich bei Fragen zum Datenschutz an die zuständige Stelle in deiner Organisation.</li>
</ul>
<p>Wie die Verschlüsselung funktioniert, steht im Artikel <a class="text-link" href="{{article:wie-sicher-ist-mumbin}}">Wie sicher ist Mumbin?</a>, die Schritte in der Anleitung {{guideLink:notizen-verschluesseln}}.</p>
`,
    },
    {
        slug: "notizen-gehoeren-dir",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Notizen in offenen Formaten: Textdateien statt Datenbank",
        title: "Deine Notizen gehören dir: Textdateien, offene Formate und ein Notausstieg",
        description: "Mumbin speichert Notizen als gewöhnliche Textdateien in einem Ordner. Dazu gibt es ein offenes Format und ein Python-Werkzeug, das geschützte Seiten ohne die App öffnet.",
        lead: "Gute Notizen sollen länger halten als jedes Programm. Deshalb legt Mumbin sie als einfache Dateien ab und dokumentiert sogar das Verschlüsselungsformat.",
        card: "Textdateien, ein offenes Format und ein unabhängiges Werkzeug: So bleiben deine Notizen lesbar und portabel.",
        related: ["wie-sicher-ist-mumbin", "notizen-ohne-cloud", "portable-notiz-app-usb-stick"],
        faq: [
            ["In welchem Format speichert Mumbin Notizen?", "Ungeschützte Seiten sind einfache Textdateien in einem Ordner deiner Wahl. Anhänge liegen in Ordnern daneben. Das Notizbuch selbst wird durch die kleine Datei notebook.mumbin beschrieben."],
            ["Kann ich meine Notizen exportieren?", "Ja. Eine Seite, ein Seitenzweig oder das ganze Notizbuch lassen sich als HTML exportieren. Der Export legt Dateien in einem neuen Ordner ab und überschreibt nichts."],
        ],
        body: `
<h2>Dateien statt Datenbank</h2>
<p>Viele Notiz-Programme legen alles in einer eigenen Datenbank ab. Mumbin geht einen anderen Weg: Jede Seite ist eine Textdatei. Das Notizbuch ist ein ganz normaler Ordner. Du kannst ihn mit jedem Programm sichern, durchsuchen oder versionieren und mit Windows-Bordmitteln kopieren.</p>

<h2>Warum das ein Vorteil ist</h2>
<ul>
  <li><strong>Lesbarkeit:</strong> Ungeschützte Seiten öffnest du notfalls mit dem Texteditor.</li>
  <li><strong>Sicherung:</strong> Backups sind Ordner-Kopien, ohne Spezialwerkzeug.</li>
  <li><strong>Unabhängigkeit:</strong> Deine Notizen hängen an keinem Konto und an keinem Dienst.</li>
  <li><strong>Mitnahme:</strong> Ein Ordner passt auf jeden Datenträger.</li>
</ul>

<h2>Auch geschützte Inhalte bleiben zugänglich</h2>
<p>Verschlüsselte Seiten sind kein Gefängnis. Das Format ist offen: Du kannst es im Quellcode und im Kopf des Python-Werkzeugs nachlesen. Mit diesem unabhängigen Werkzeug und deinem Passwort entschlüsselst du ein Notizbuch auch dann, wenn Mumbin einmal nicht mehr verfügbar ist. Es schreibt eine entschlüsselte Kopie in einen neuen Ordner und überschreibt nichts.</p>
<div class="code">python mumbin_decrypt.py "C:\\Notizen\\MeinBuch" --out "C:\\Notizen\\MeinBuch-offen"</div>
<p>Die genauen Schritte beschreibt die Anleitung {{guideLink:notizbuch-mitnehmen}}. Das Werkzeug lädst du <a class="text-link" href="{{tool}}">hier</a> herunter. Voraussetzung ist Python 3 mit dem Paket <code>pynacl</code>.</p>

<h2>Weitergeben als HTML</h2>
<p>Für Leserinnen und Leser, die Mumbin nicht haben, exportierst du Seiten als HTML oder druckst sie. Beachte, dass entsperrte geschützte Seiten dabei im Klartext erscheinen.</p>
[[shot:settings]]

<h2>Nachprüfbar statt „vertrau uns“</h2>
<p>Der Quellcode von Mumbin ist öffentlich einsehbar. Automatische Tests prüfen den Kern, die Oberfläche und die echte EXE, auch Verschlüsselung und Angriffe auf Dateinamen. Mehr zum Schutz steht im Artikel <a class="text-link" href="{{article:wie-sicher-ist-mumbin}}">Wie sicher ist Mumbin?</a></p>
`,
    },
];

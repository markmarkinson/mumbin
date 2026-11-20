// German texts of the website. Inline HTML is allowed in strings; `[[shot:name]]` in a guide
// becomes the figure of that screenshot (see `shots`).

module.exports = {
    lang: "de",
    locale: "de-DE",
    title: "Mumbin: Verschlüsselte Notiz-App für Windows (kostenlos, offline)",
    description:
        "Kostenlose, verschlüsselte Notiz-App für Windows: Notizen, Dokumente und Aufgaben verknüpfen und schützen. Offline, ohne Konto, eine portable EXE.",
    skip: "Zum Inhalt springen",
    nav: { features: "Funktionen", protection: "Schutz", speed: "Tempo", blog: "Blog", faq: "FAQ", download: "Herunterladen", language: "EN", languageTitle: "English version" },

    hero: {
        badge: "Vorabversion 0.1.0 · Kostenlos · Quellcode einsehbar",
        title: 'Alles, was dir wichtig ist.<br><span class="red">Sicher bei dir.</span>',
        lead: "Die kostenlose, verschlüsselte Notiz-App für Windows: Notizen, Dokumente, Material und Aufgaben an einem Ort – verknüpft, durchsuchbar und auf Wunsch stark verschlüsselt. Lokal auf deinem Windows-PC, ohne Konto, in einer einzigen portablen EXE.",
        download: "Für Windows herunterladen",
        source: "Quellcode auf GitHub",
        chips: ["Windows 10/11", "≈ 4,3 MB", "Ohne Konto", "Läuft offline"],
        fine: "Vorabversion · nicht signiert · WebView2 erforderlich. Prüfsumme und Hinweise stehen auf der Release-Seite.",
    },

    intro: {
        label: "Mehr Ordnung, weniger Suchen",
        title: 'Alles an einem Ort. <span class="red">Und nur du kommst heran.</span>',
        lead: "Eine Reise planen, Unterlagen sammeln, etwas lernen, Daten in Tabellen festhalten: Mumbin hält Texte, Dateien, Tabellen und Aufgaben zusammen und lässt dich selbst bestimmen, welche Seiten offen bleiben und welche nur mit Passwort aufgehen.",
        benefits: [
            "Seiten im Baum ordnen und mit Links verknüpfen – Rückverweise zeigen, was zusammengehört",
            "Formatierung direkt beim Schreiben: Überschriften, Listen, Tabellen, Bilder – und beliebige Dateien als Anhänge",
            "Aufgaben stehen in der Notiz; die Übersicht sammelt sie nach Notiz, mit Beginn und Frist",
            "Suche mit Wortgruppen, Ausschlüssen und Tags – Treffer mit Vorschau",
            "Verschlüsseln: gemeinsamer Tresor, eigenes Passwort pro Seite oder ein versiegeltes Notizbuch",
            "Notizbücher sind gewöhnliche Ordner mit Textdateien – kopieren, sichern, mitnehmen",
            "Ein unabhängiges Python-Werkzeug entschlüsselt deine Daten auch ohne Mumbin",
            "Deutsch und Englisch, umschaltbar ohne Neustart",
        ],
    },

    features: {
        label: "Funktionen",
        title: "Von der losen Notiz zum eigenen Wissensnetz",
        lead: "Alles, was du zum Sammeln, Ordnen und Wiederfinden brauchst – ohne dass die Oberfläche dich überfordert.",
        rows: [
            {
                label: "Schreiben",
                title: "Formatieren, während du schreibst",
                text: "Überschriften, Fett, Kursiv, Listen und Tabellen sehen sofort so aus, wie sie sind. Nur in der Zeile mit dem Cursor zeigt Mumbin den Quelltext. Bilder und Dateien ziehst du einfach in die Seite.",
                points: [
                    "Überschriften, Aufzählungen, Aufgabenkästchen, Tabellen und Code",
                    "Bilder und Anhänge per Drag & Drop, als Kopie oder als Verknüpfung",
                    "Formatleiste und Tastenkürzel; Strg+Umschalt+P zeigt alle Befehle",
                ],
                shots: ["write"],
            },
            {
                label: "Verknüpfen",
                title: "Seiten verbinden. Zusammenhänge sehen.",
                text: "Ordne Seiten in einem Baum mit Unterseiten und verlinke sie untereinander. Die Rückverweise zeigen dir bei jeder Seite, wo sie noch vorkommt, und Tags ordnen quer zur Struktur.",
                points: [
                    "Links zwischen Seiten; beim Umbenennen werden sie mitgeführt",
                    "Rückverweise und Stichwort-Wolke unter dem Seitenbaum",
                    "Seiten umbenennen oder verschieben, ohne dass Verweise brechen",
                ],
                shots: ["links", "tags"],
            },
            {
                label: "Finden",
                title: "Wiederfinden, was du aufgeschrieben hast",
                text: "Die Suche durchsucht Titel und Text. Mit Anführungszeichen suchst du Wortgruppen, mit einem Minus schließt du Begriffe aus, mit @Tag oder einem Seitennamen grenzt du ein. Jeder Treffer zeigt eine Vorschau.",
                points: [
                    "Wortgruppen, Ausschlüsse, Tags und Seitenmuster kombinierbar",
                    "Strg+J springt in Sekunden zu jeder Seite",
                    "Gesperrte Inhalte tauchen bewusst nicht in Treffern auf",
                ],
                shots: ["search"],
            },
            {
                label: "Aufgaben",
                title: "Aufgaben bleiben dort, wo sie entstanden sind",
                text: "Schreibe ein Kästchen in die Notiz – die Aufgabenübersicht sammelt alle, standardmäßig nach Notiz geordnet. Ein Klick hakt ab, ein Klick auf den Text springt zurück an die Stelle. Beginn und Frist sind freiwillig und per Datumswähler gesetzt.",
                points: [
                    "Ansichten: Offen, Aktiv, Wartend, Fällig, Erledigt",
                    "Filter nach Wörtern und @Tags, umschaltbar nach Notiz gruppiert",
                    "Datumswähler in der Liste und im Editor (Strg+Umschalt+D)",
                ],
                shots: ["tasks", "taskdates"],
            },
            {
                label: "Notizbücher",
                title: "Mehrere Notizbücher, jedes in seinem Ordner",
                text: "Wechsle zwischen Notizbüchern, öffne einen Ordner oder lege ein neues an. Jedes Notizbuch hat eigene Einstellungen: eine Seite als Vorlage für neue Seiten, endgültig löschen statt Papierkorb und automatisches Verschlüsseln neuer Seiten.",
                points: [
                    "Ein Klick wechselt das Notizbuch; geschützte werden beim Öffnen entsperrt",
                    "Die Vorlage ist eine ganz normale Seite deines Notizbuchs",
                    "Die Einstellungen wandern im Ordner mit",
                ],
                shots: ["notebooks", "settings"],
            },
            {
                label: "Bedienung",
                title: "Aufgeräumt, schnell und zweisprachig",
                text: "Die Oberfläche bleibt ruhig: eine Leiste zum Formatieren, ein Baum zum Navigieren, ein Menü für alles Weitere. Deutsch und Englisch schaltest du in den Einstellungen um, sofort und ohne Neustart.",
                points: [
                    "Eigenes Rechtsklick-Menü im Text: Rückgängig, Ausschneiden, Kopieren, Einfügen",
                    "Nur-Lesen-Modus, einstellbare Schriftgröße, ein- und ausblendbare Seitenleiste",
                    "Seite, Seitenzweig oder ganzes Notizbuch als HTML exportieren oder drucken",
                ],
                shots: ["language", "protect-menu"],
            },
        ],
    },

    protection: {
        label: "Schutz & Privatsphäre",
        title: "Du entscheidest, was privat bleibt.",
        lead: "Mumbin verschlüsselt mit Argon2id und XChaCha20-Poly1305. Du wählst den Schutz, der zu deinem Notizbuch passt – und kannst ihn mischen.",
        cards: [
            { title: "Ein Passwort für viele Seiten", text: "Der Tresor des Notizbuchs schützt ausgewählte Seiten und ihre Anhänge mit einer Passphrase. Alle anderen Seiten bleiben offen." },
            { title: "Ein eigenes Passwort pro Seite", text: "Einzelne Seiten bekommen unabhängig vom Tresor ein eigenes Passwort. Jede Seite kann ein anderes haben – samt ihren Anhängen." },
            { title: "Ein versiegeltes Notizbuch", text: "Alles ist verschlüsselt, auch die Namen der Seiten und Anhänge auf der Festplatte. Das Passwort wird beim Öffnen abgefragt." },
        ],
        table: {
            head: ["Schutzart", "Passwort", "Dateinamen", "Geeignet für"],
            rows: [
                ["Tresor", "Eins für alle geschützten Seiten", "Seitennamen sichtbar", "Mehrere vertrauliche Seiten mit einem Schlüssel"],
                ["Eigenes Passwort", "Eins pro Seite", "Seitenname sichtbar", "Einzelne Seiten mit getrenntem Zugang"],
                ["Versiegeltes Notizbuch", "Eins fürs ganze Notizbuch", "Seiten- und Anhangsnamen verborgen", "Alles schützen, nichts verraten"],
            ],
        },
        shots: ["password", "locked"],
    },

    speed: {
        label: "Tempo",
        title: "Schnell – auch wenn die Sammlung wächst.",
        lead: "Gemessen an einem Beispiel-Notizbuch mit 2.000 Seiten und 13,7 MB Text.",
        stats: [
            ["1,0 s", "vom Start der EXE bis zum geöffneten Notizbuch"],
            ["51 ms", "Volltextsuche über alle 2.000 Seiten"],
            ["33 ms", "pro Tastendruck beim Tippen auf einer normalen Seite"],
            ["4,3 MB", "die ganze App – eine portable EXE ohne Installation"],
        ],
        method:
            "Messwerte der Version 0.1.0 (Release-Build) auf dem Entwicklungsrechner, ermittelt mit dem Messskript <code>tests/perf/perf.mjs</code> aus dem Quellcode. Auf anderen Rechnern fallen sie anders aus. Das Programm selbst belegt etwa 70 MB Arbeitsspeicher, die WebView2-Laufzeit kommt hinzu (im Test insgesamt rund 540 MB).",
    },

    privacy: {
        label: "Privatsphäre & Kontrolle",
        title: "Deine Dateien. Deine Entscheidung.",
        cards: [
            { title: "Alles bleibt lokal", text: "Kein Konto, keine Cloud, keine Telemetrie. Deine Notizen verlassen deinen Rechner nur, wenn du sie selbst weitergibst." },
            { title: "Dateien statt Datenbank", text: "Ungeschützte Seiten sind Textdateien in einem Ordner deiner Wahl. Du kannst sie mit jedem Programm sichern, durchsuchen oder versionieren." },
            { title: "Portabel", text: "Eine EXE und ein Ordner. Einstellungen liegen daneben in mumbin_data, nicht in der Registry. Kopiere alles auf einen USB-Stick oder einen anderen PC." },
            { title: "Abgeschottete Oberfläche", text: "Die Oberfläche lädt keine Fremdinhalte und blockiert externe Anfragen. Links öffnest du bewusst im Browser oder im zuständigen Programm." },
            { title: "Nachprüfbar", text: "Der Quellcode ist öffentlich einsehbar. Automatische Tests prüfen Kern, Oberfläche und die echte EXE – auch Verschlüsselung und Angriffe auf Dateinamen." },
            { title: "Ein Notausstieg", text: "Ein unabhängiges Python-Werkzeug entschlüsselt dein Notizbuch mit dem richtigen Passwort, auch wenn es Mumbin einmal nicht mehr gibt." },
        ],
    },

    download: {
        label: "Download",
        title: "Hol dir Mumbin",
        text: "Eine portable EXE. Herunterladen, in einen Ordner legen, starten – ohne Installation.",
        button: "Mumbin herunterladen",
        release: "Release & SHA-256 auf GitHub ↗",
        file: "mumbin.exe",
        psst: "Psst … nur für dich.",
        specs: [
            ["Version", "0.1.0 (Vorabversion)"],
            ["System", "Windows 10 oder 11, 64 Bit"],
            ["Laufzeit", "Microsoft Edge WebView2 (auf vielen PCs vorhanden)"],
            ["Größe", "≈ 4,3 MB · .exe"],
            ["Installation", "Keine – kopieren und starten"],
            ["Signatur", "Nicht signiert; Windows kann eine Warnung zeigen"],
        ],
        verify: "Prüfsumme der Datei vergleichen:",
        command: "Get-FileHash mumbin.exe -Algorithm SHA256",
        tool: "Entschlüsselungs-Werkzeug (Python) herunterladen ↓",
        toolGuide: "Anleitung dazu ↗",
        steps: [
            ["Herunterladen", "Lade mumbin.exe herunter und lege sie in einen beschreibbaren Ordner."],
            ["Starten", "Starte die EXE. Beim ersten Mal wählst du den Ordner für dein Notizbuch."],
            ["Loslegen", "Schreibe eine Seite, verknüpfe sie mit einer zweiten und schütze, was privat bleiben soll."],
        ],
    },

    gallery: { label: "Screenshots", title: "So sieht Mumbin aus", lead: "Echte Bilder der aktuellen Version mit künstlichen Beispieldaten. Anklicken zum Vergrößern." },

    blog: {
        label: "Blog",
        title: "Wissen rund um Notizen, Datenschutz und Ordnung",
        lead: "Ratgeber und Schritt-für-Schritt-Anleitungen: Anwendungsfälle, Verschlüsselung und der Alltag mit Mumbin.",
        read: "Lesen →",
        all: "Alle Beiträge →",
        back: "Alle Beiträge",
        indexTitle: "Blog: Notizen, Wissen und Datenschutz mit Mumbin",
        indexDescription: "Ratgeber und Anleitungen rund um verschlüsselte Notizen: Anwendungsfälle, Vorteile lokaler Speicherung, Sicherheit erklärt und der Alltag mit Mumbin unter Windows.",
        indexLead: "Verständliche Artikel zu Anwendungsfällen, Vorteilen und Sicherheit – dazu Schritt-für-Schritt-Anleitungen für den Einstieg.",
        faqTitle: "Häufige Fragen",
        minutes: "Min. Lesezeit",
        home: "Mumbin",
        kindArticle: "Ratgeber",
        kindGuide: "Anleitung",
        quoteOpen: "„",
        quoteClose: "“",
    },

    guides: {
        label: "Anleitungen",
        title: "Verstehen und loslegen",
        lead: "Drei Anleitungen führen dich Schritt für Schritt durch die wichtigsten Abläufe.",
        read: "Anleitung lesen →",
        back: "Alle Anleitungen",
        next: "Weiter mit",
        minutes: "Min. Lesezeit",
    },

    fit: {
        label: "Passt Mumbin zu dir?",
        title: "Dein Wissen. Dein Arbeitsstil.",
        yesTitle: "Gut geeignet, wenn du …",
        yes: [
            "persönlich unter Windows arbeitest und auch offline schreiben möchtest.",
            "Notizen, Dokumente, Aufgaben und Material im Zusammenhang behalten willst.",
            "lokale Dateien und eingebauten Passwortschutz suchst.",
            "einzelne Seiten mit getrennten Passwörtern schützen möchtest.",
        ],
    },

    faq: {
        label: "FAQ",
        title: "Gut zu wissen",
        items: [
            ["Was kann ich in Mumbin ablegen?", "Texte mit Formatierung, Tabellen, Bilder und beliebige Dateien als Anhänge, zum Beispiel PDFs, Scans oder Tabellenkalkulationen. Alles bleibt im Ordner deines Notizbuchs. Bilder zeigt Mumbin an, andere Dateien öffnet es mit dem passenden Programm."],
            ["Muss ich etwas installieren?", "Nein. Mumbin ist eine portable EXE: in einen beschreibbaren Ordner legen und starten. Einstellungen werden daneben in <code>mumbin_data</code> gespeichert. Benötigt wird die Microsoft Edge WebView2 Runtime, die auf vielen Windows-PCs bereits vorhanden ist."],
            ["Sendet Mumbin meine Notizen ins Internet?", "Nein. Die App speichert Notizen lokal und hat keine Cloud-Anbindung und keine Telemetrie. Links, die du bewusst anklickst, öffnen deinen Browser oder das zuständige Programm. Diese Website wird unabhängig davon von GitHub Pages ausgeliefert."],
            ["Wie sicher ist die Verschlüsselung?", "Mumbin nutzt Argon2id zum Ableiten des Schlüssels aus deinem Passwort und XChaCha20-Poly1305 zum Verschlüsseln; verändert jemand eine Datei, fällt das beim Entschlüsseln auf. Das Format ist offen: Du kannst es im Quellcode und im Python-Werkzeug nachlesen."],
            ["Wem gehört mein Passwort?", "Nur dir. Es gibt keine Hintertür – deshalb kann außer dir niemand deine geschützten Seiten öffnen, auch nicht das unabhängige Werkzeug ohne dein Passwort. Bewahre es sicher auf und sichere deinen Notizbuchordner."],
            ["Welche Schutzart soll ich wählen?", "Für einzelne vertrauliche Seiten reicht ein eigenes Passwort pro Seite. Mehrere Seiten mit einem Schlüssel schützt der Tresor. Wenn auch die Namen der Seiten und Anhänge verborgen sein sollen, wähle beim Anlegen des Notizbuchs die Versiegelung."],
            ["Bleiben meine Notizen lesbar, wenn Mumbin verschwindet?", "Ungeschützte Seiten sind einfache Textdateien. Geschützte Seiten öffnest du mit dem mitgelieferten Python-Werkzeug und deinem Passwort – ohne Mumbin."],
            ["Kann ich Notizen auf mehreren PCs benutzen?", "Ja: Kopiere den Notizbuchordner und die EXE, zum Beispiel per USB-Stick, oder gleiche den Ordner mit einem Dateisync-Dienst deiner Wahl ab. So hast du deine Notizen überall dabei – ohne Konto."],
            ["Kann ich meine Notizen exportieren oder drucken?", "Ja. Eine Seite, ein Seitenzweig oder das ganze Notizbuch lassen sich als HTML exportieren; Seiten kannst du drucken. Entsperrte geschützte Seiten erscheinen dabei im Klartext."],
            ["Wie funktionieren Aufgaben?", "Du schreibst ein Kästchen in die Notiz, optional mit Beginn und Frist. Die Aufgabenübersicht sammelt alle Aufgaben deiner Seiten, nach Notiz gruppiert oder als eine Liste."],
            ["Kann ich vorhandene Texte und Dateien mitnehmen?", "Ja: Texte fügst du direkt in eine Seite ein, Dateien legst du als Anhänge ab. Alles landet im Ordner deines Notizbuchs."],
        ],
    },

    closing: {
        peek: "Ich warte schon.",
        title: "Fang mit einer Seite an.",
        text: "Eine Datei herunterladen, ein Notizbuch anlegen und loslegen. Alles Weitere wächst mit deinen Ideen.",
    },

    footer: { tagline: "Lokale Notizen. Eigene Gedanken.", privacy: "Datenschutz", license: "Lizenz", licenses: "Drittanbieter", rights: "© 2026 markMarkinson. Alle Rechte vorbehalten." },

    privacyPage: {
        title: "Datenschutz",
        seoTitle: "Datenschutz bei Mumbin: keine Tracker, keine Cookies",
        body: "Diese statische Website wird über GitHub Pages ausgeliefert. Sie verwendet keine Analyse-Tools, Tracking-Cookies oder extern geladenen Schriftarten. Die Screenshots zeigen ausschließlich künstliche Beispieldaten. Beim Abruf der Website und bei Downloads verarbeitet GitHub technisch erforderliche Verbindungsdaten. Die Datenverarbeitung von GitHub ist in dessen Datenschutzerklärung beschrieben. Links zu GitHub und anderen Websites verlassen dieses Angebot.",
        back: "Zur Website",
    },

    shots: {
        overview: ["Mumbin mit einer Beispielseite: Seitenbaum, Bild, Tabelle und Rückverweise", "Eine Seite mit Bild, Tabelle und Rückverweisen"],
        write: ["Eine Seite mit Tabelle und Aufgaben beim Schreiben", "Tabellen, Listen und Aufgaben direkt im Text"],
        links: ["Rückverweise unter dem Seitenbaum", "Rückverweise: wer verlinkt auf diese Seite?"],
        tags: ["Stichwort-Wolke mit Tags", "Tags ordnen quer zur Seitenstruktur"],
        search: ["Suchergebnisse mit Vorschau in der Seitenleiste", "Die Suche zeigt Treffer mit Vorschau"],
        tasks: ["Aufgabenübersicht nach Notiz gruppiert mit Fristen", "Aufgaben nach Notiz gruppiert, mit Beginn und Frist"],
        taskdates: ["Dialog zum Festlegen von Beginn und Frist einer Aufgabe", "Beginn und Frist per Datumswähler (freiwillig)"],
        "protect-menu": ["Seitenmenü mit den Schutzarten und dem Export", "Das Seitenmenü: Verschlüsseln, Exportieren, Drucken"],
        password: ["Dialog zum Schützen einer Seite mit eigenem Passwort und Stärkeanzeige", "Ein eigenes Passwort für diese Seite"],
        locked: ["Gesperrte Seite mit Schloss und Entsperren-Knopf", "Gesperrt bleibt der Inhalt verborgen"],
        contextmenu: ["Eigenes Rechtsklick-Menü im Text", "Das Rechtsklick-Menü im Stil der App"],
        settings: ["Einstellungen mit der Gruppe Dieses Notizbuch", "Einstellungen pro Notizbuch: Papierkorb, Verschlüsselung, Vorlage"],
        language: ["Mumbin mit englischer Oberfläche", "Die Oberfläche lässt sich auf Englisch umschalten"],
        notebooks: ["Notizbuch-Wechsler mit drei Notizbüchern", "Mehrere Notizbücher, jedes in seinem Ordner"],
    },

    guideList: [
        {
            slug: "notizen-verschluesseln",
            short: "Notizen verschlüsseln",
            seoTitle: "Notizen verschlüsseln: Tresor, Passwort oder Versiegelung | Mumbin",
            minutes: 6,
            title: "Notizen verschlüsseln: Tresor, eigenes Passwort oder versiegeltes Notizbuch",
            lead: "Drei Wege, Seiten zu schützen – und wie du den passenden findest. Mit Schritten für jede Variante.",
            card: "Welche Schutzart passt zu welcher Notiz? Schritt für Schritt: eigenes Passwort pro Seite, gemeinsamer Tresor und versiegeltes Notizbuch.",
            body: `
<h2>Die drei Schutzarten</h2>
<p>Mumbin schützt Notizen auf der Festplatte. Du wählst pro Seite oder pro Notizbuch:</p>
<ul>
  <li><strong>Eigenes Passwort für eine Seite:</strong> Die Seite (und ihre Anhänge) öffnet sich nur mit ihrem Passwort. Jede Seite kann ein anderes haben.</li>
  <li><strong>Tresor des Notizbuchs:</strong> Eine Passphrase schützt alle Seiten, die du dem Tresor übergibst.</li>
  <li><strong>Versiegeltes Notizbuch:</strong> Alles ist verschlüsselt, auch die Namen der Seiten und Anhänge auf der Festplatte.</li>
</ul>
<p>Der Tipp: Soll auch verborgen bleiben, <em>wie</em> deine Seiten heißen, versiegle das Notizbuch – dann sind auch die Namen der Seiten und Anhänge verschlüsselt.</p>

<h2>Eine einzelne Seite mit eigenem Passwort schützen</h2>
<ol>
  <li>Öffne die Seite im Seitenbaum.</li>
  <li>Klicke in der Seitenleiste auf den Pfeil neben dem <code>+</code> und wähle <strong>„Seite mit eigenem Passwort schützen …“</strong>.</li>
  <li>Gib das Passwort zweimal ein. Die Stärkeanzeige hilft dir; das Passwort muss mindestens zehn Zeichen lang sein.</li>
  <li>Bestätige mit <strong>„Schützen“</strong>.</li>
</ol>
[[shot:password]]
<p>Die Seite bleibt geöffnet, bis du sie über das Seitenmenü mit <strong>„Seite sperren“</strong> schließt, die automatische Sperre greift oder du das Notizbuch wechselst. Im Seitenbaum zeigt ein Schloss den Zustand. Eine gesperrte Seite zeigt statt ihres Textes den Knopf <strong>„Entsperren …“</strong> und fragt nach dem Passwort genau dieser Seite.</p>
[[shot:locked]]
<p>Im selben Menü findest du <strong>„Passwort ändern …“</strong> und <strong>„Schutz entfernen …“</strong>. Das Passwort einer Seite gehört nur dir: Es gibt keine Hintertür, deshalb bewahre es sicher auf.</p>

<h2>Mehrere Seiten mit einem Tresor schützen</h2>
<ol>
  <li>Öffne das Zahnrad-Menü und wähle <strong>„Verschlüsselung verwalten …“</strong>.</li>
  <li>Klicke auf <strong>„Einrichten …“</strong> und vergib eine Passphrase.</li>
  <li>Verschlüssele Seiten einzeln über das Seitenmenü <strong>„Seite verschlüsseln“</strong> oder alle auf einmal mit <strong>„Alle Seiten verschlüsseln“</strong>.</li>
</ol>
<p>In den Einstellungen unter <strong>„Dieses Notizbuch“</strong> kannst du festlegen, dass neue Seiten automatisch verschlüsselt werden. Im Dialog „Verschlüsselung verwalten“ stellst du die automatische Sperre nach einer Leerlaufzeit ein.</p>

<h2>Ein ganzes Notizbuch versiegeln</h2>
<p>Beim Anlegen eines neuen Notizbuchs fragt Mumbin: <strong>„Neues Notizbuch mit Passphrase schützen?“</strong>. Wählst du <strong>„Mit Passphrase schützen“</strong>, wird alles verschlüsselt – jede Seite, jeder Anhang und sogar deren Namen auf der Festplatte. Beim Öffnen fragt Mumbin nach der Passphrase. Ein versiegeltes Notizbuch wählst du direkt beim Anlegen.</p>

`,
        },
        {
            slug: "aufgaben-mit-frist",
            short: "Aufgaben mit Frist",
            seoTitle: "Aufgaben mit Frist in Notizen verwalten | Mumbin",
            minutes: 4,
            title: "Aufgaben mit Beginn und Frist in deinen Notizen",
            lead: "Aufgaben bleiben in der Notiz, in der sie entstehen. So setzt du Beginn und Frist und behältst den Überblick.",
            card: "Kästchen in die Notiz schreiben, Beginn und Frist per Datumswähler setzen und alles in der Aufgabenübersicht überblicken.",
            body: `
<h2>Eine Aufgabe schreiben</h2>
<p>Eine Aufgabe ist eine Zeile mit einem Kästchen. Klicke in der Formatleiste auf das Kästchen-Symbol (<code>☐</code>) oder schreibe <code>[ ] Text</code>. Auch Zeilen, die mit <code>TODO:</code> beginnen, zählen als Aufgabe.</p>
<ul>
  <li>Mit <code>!</code> oder <code>!!</code> markierst du die Wichtigkeit.</li>
  <li>Mit <code>@name</code> gibst du ein Stichwort.</li>
  <li>Eingerückte Zeilen sind Unteraufgaben.</li>
</ul>

<h2>Beginn und Frist festlegen</h2>
<p>Beides ist freiwillig. Mumbin erkennt <code>&gt;2026-12-01</code> als <strong>Beginn</strong> und <code>&lt;2026-12-31</code> als <strong>Frist</strong> am Ende der Zeile. Du musst die Zeichen nicht tippen:</p>
<ol>
  <li><strong>Im Editor:</strong> Setze den Cursor in die Aufgabe und drücke <code>Strg+Umschalt+D</code>. Oder klicke auf den Kalender-Knopf der Formatleiste (<code>Strg+D</code>): Auf einer Aufgabe steht dort als Erstes „Beginn und Frist der Aufgabe festlegen …“.</li>
  <li><strong>In der Aufgabenübersicht:</strong> Fahre mit der Maus über eine Aufgabe und klicke auf den Kalender-Knopf rechts.</li>
</ol>
[[shot:taskdates]]
<p>Leere Felder löschen das Datum wieder. Mumbin schreibt es als Text in die Zeile, du siehst es also immer direkt in der Notiz.</p>

<h2>Die Aufgabenübersicht</h2>
<p>Klicke oben links auf <strong>„Aufgaben“</strong>. Die Übersicht sammelt alle Aufgaben deiner Seiten – standardmäßig nach Notiz gruppiert; der Knopf <strong>„Nach Notiz“</strong> schaltet auf eine einzige Liste um.</p>
[[shot:tasks]]
<ul>
  <li><strong>Offen:</strong> alles Unerledigte.</li>
  <li><strong>Aktiv:</strong> Aufgaben, die jetzt angegangen werden können (ohne späteren Beginn).</li>
  <li><strong>Wartend:</strong> mit „waiting“ oder „planned“ markiert.</li>
  <li><strong>Fällig:</strong> die Frist ist heute oder vorbei.</li>
  <li><strong>Erledigt:</strong> abgehakt.</li>
</ul>
<p>Ein Klick auf das Kästchen hakt ab, ein Klick auf den Text springt in die Notiz. Das Feld oben filtert nach Wörtern und <code>@Tags</code>. Gesperrte Seiten erscheinen nicht in der Übersicht.</p>
`,
        },
        {
            slug: "notizbuch-mitnehmen",
            short: "Notizbuch mitnehmen",
            seoTitle: "Notizbuch sichern, mitnehmen und ohne Mumbin öffnen",
            minutes: 4,
            title: "Notizbuch sichern, mitnehmen und ohne Mumbin öffnen",
            lead: "Dein Notizbuch ist ein Ordner. So sicherst du ihn, nimmst ihn mit und kommst auch ohne Mumbin an geschützte Inhalte.",
            card: "Ordner kopieren, auf einem anderen PC weiterarbeiten, als HTML weitergeben und mit dem Python-Werkzeug entschlüsseln.",
            body: `
<h2>Ein Notizbuch ist ein Ordner</h2>
<p>Jedes Notizbuch liegt in einem Ordner deiner Wahl. Ungeschützte Seiten sind einfache Textdateien, Anhänge liegen in Ordnern daneben:</p>
<div class="code">Mein-Notizbuch/ ├─ notebook.mumbin ├─ Meine_Notizen.txt ├─ Island-Reise.txt └─ Island-Reise/aurora.png</div>
<p>Zum <strong>Sichern</strong> kopierst du den Ordner. Warte dafür, bis Mumbin „gespeichert“ anzeigt, oder beende das Programm. Für einen <strong>anderen PC</strong> kopierst du den Ordner und die <code>mumbin.exe</code>; die persönlichen Einstellungen liegen im Ordner <code>mumbin_data</code> neben der EXE.</p>

<h2>Weitergeben als HTML oder Ausdruck</h2>
<p>Im Seitenmenü (Pfeil neben dem <code>+</code>) findest du <strong>„Seite mit Unterseiten als HTML exportieren …“</strong> und <strong>„Ganzes Notizbuch als HTML exportieren …“</strong>. Der Export legt Dateien in einem neuen Ordner ab und überschreibt nichts. Mit <strong>„Seite drucken“</strong> druckst du eine Seite. Gesperrte Seiten fehlen im Export. Entsperrte geschützte Seiten werden im Klartext exportiert – denke daran, bevor du den Export weitergibst.</p>
[[shot:protect-menu]]

<h2>Geschützte Inhalte ohne Mumbin öffnen</h2>
<p>Falls Mumbin einmal nicht mehr verfügbar ist, kommst du mit dem unabhängigen Python-Werkzeug und deinem Passwort an alle geschützten Seiten und Anhänge. Es liest den Notizbuchordner und schreibt eine entschlüsselte Kopie in einen <strong>neuen</strong> Ordner.</p>
<ol>
  <li>Installiere Python 3 und das Paket <code>pynacl</code>: <code>pip install pynacl</code></li>
  <li>Lade <a class="text-link" href="{{tool}}">mumbin_decrypt.py</a> herunter.</li>
  <li>Starte: <code>python mumbin_decrypt.py "C:\\Notizen\\MeinBuch" --out "C:\\Notizen\\MeinBuch-offen"</code></li>
</ol>
<p>Für Seiten mit <strong>eigenem Passwort</strong> setzt du die Umgebungsvariable <code>MUMBIN_PAGE_PASSWORD</code> oder tippst das Passwort, wenn das Werkzeug danach fragt. Das Ergebnis ist ein gewöhnliches Notizbuch aus Textdateien. Ohne das richtige Passwort geht nichts – auch nicht für uns.</p>
`,
        },
    ],
};

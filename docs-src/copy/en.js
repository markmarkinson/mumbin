// English texts of the website; same shape as de.js.

module.exports = {
    lang: "en",
    locale: "en-GB",
    title: "Mumbin: Encrypted Note-Taking App for Windows (Free, Offline)",
    description:
        "Free, encrypted note-taking app for Windows: link, search and protect notes, documents and tasks. Offline, no account, one portable EXE.",
    skip: "Skip to content",
    nav: { features: "Features", protection: "Protection", speed: "Speed", blog: "Blog", faq: "FAQ", download: "Download", language: "DE", languageTitle: "Deutsche Version" },

    hero: {
        badge: "Preview 0.1.0 · Free · Source code available",
        title: 'Everything that matters to you.<br><span class="red">Safe with you.</span>',
        lead: "The free, encrypted note-taking app for Windows: notes, documents, material and tasks in one place – linked, searchable and, if you like, strongly encrypted. Local on your Windows PC, no account, in one portable EXE.",
        download: "Download for Windows",
        source: "Source code on GitHub",
        chips: ["Windows 10/11", "≈ 4.3 MB", "No account", "Works offline"],
        fine: "Preview release · unsigned · needs WebView2. The checksum and notes are on the release page.",
    },

    intro: {
        label: "More order, less searching",
        title: 'Everything in one place. <span class="red">And only you can get to it.</span>',
        lead: "Plan a trip, collect paperwork, learn something, keep data in tables: Mumbin holds text, files, tables and tasks together and lets you decide which pages stay open and which only open with a password.",
        benefits: [
            "Arrange pages in a tree and link them – backlinks show what belongs together",
            "Formatting while you type: headings, lists, tables, pictures – and any file as an attachment",
            "Tasks live in your notes; the overview collects them by note, with start and deadline",
            "Search with phrases, exclusions and tags – results come with a preview",
            "Encrypt: a shared vault, a password of its own per page, or a sealed notebook",
            "Notebooks are plain folders of text files – copy, back up, take along",
            "An independent Python tool decrypts your data even without Mumbin",
            "German and English, switchable without a restart",
        ],
    },

    features: {
        label: "Features",
        title: "From a loose note to your own web of knowledge",
        lead: "Everything you need to collect, organise and find things again – without a cluttered interface.",
        rows: [
            {
                label: "Write",
                title: "Format as you write",
                text: "Headings, bold, italic, lists and tables look like what they are right away. Only the line with the cursor shows the source. Drag pictures and files straight into the page.",
                points: [
                    "Headings, bullets, task boxes, tables and code",
                    "Pictures and attachments by drag and drop, as a copy or a link",
                    "Format bar and shortcuts; Ctrl+Shift+P lists every command",
                ],
                shots: ["write"],
            },
            {
                label: "Connect",
                title: "Connect pages. See what belongs together.",
                text: "Arrange pages in a tree with subpages and link them to each other. Backlinks show where a page is mentioned, and tags organise across the structure.",
                points: [
                    "Links between pages, kept intact when you rename",
                    "Backlinks and a tag cloud below the page tree",
                    "Rename or move pages without breaking links",
                ],
                shots: ["links", "tags"],
            },
            {
                label: "Find",
                title: "Find what you wrote down",
                text: "Search covers titles and text. Quotation marks find phrases, a minus excludes words, @tags or a page name narrow it down. Every hit shows a preview.",
                points: [
                    "Phrases, exclusions, tags and page patterns can be combined",
                    "Ctrl+J jumps to any page in seconds",
                    "Locked content deliberately never shows up in results",
                ],
                shots: ["search"],
            },
            {
                label: "Tasks",
                title: "Tasks stay where they came from",
                text: "Write a checkbox into a note – the task overview collects them all, grouped by note by default. One click ticks it off, a click on the text takes you back to the spot. Start and deadline are optional and set with a date picker.",
                points: [
                    "Views: Open, Active, Waiting, Due, Done",
                    "Filter by words and @tags, switchable between grouped by note and one list",
                    "A date picker in the list and in the editor (Ctrl+Shift+D)",
                ],
                shots: ["tasks", "taskdates"],
            },
            {
                label: "Notebooks",
                title: "Several notebooks, each in its own folder",
                text: "Switch between notebooks, open a folder or create a new one. Each notebook has its own settings: a page as the template for new pages, delete for good instead of the recycle bin, and automatic encryption of new pages.",
                points: [
                    "One click switches notebooks; protected ones are unlocked when you open them",
                    "The template is an ordinary page of your notebook",
                    "The settings travel with the folder",
                ],
                shots: ["notebooks", "settings"],
            },
            {
                label: "Use",
                title: "Tidy, quick and bilingual",
                text: "The interface stays calm: one bar for formatting, a tree for navigating, one menu for everything else. Switch between German and English in the settings, instantly and without a restart.",
                points: [
                    "Its own right-click menu in the text: Undo, Cut, Copy, Paste",
                    "Read-only mode, adjustable font size, a sidebar you can hide",
                    "Export a page, a branch or the whole notebook as HTML, or print",
                ],
                shots: ["language", "protect-menu"],
            },
        ],
    },

    protection: {
        label: "Protection & privacy",
        title: "You decide what stays private.",
        lead: "Mumbin encrypts with Argon2id and XChaCha20-Poly1305. You choose the protection that suits your notebook – and you can mix them.",
        cards: [
            { title: "One password for many pages", text: "The notebook's vault protects selected pages and their attachments with one passphrase. All other pages stay open." },
            { title: "A password of its own per page", text: "Single pages get a password of their own, independent of the vault. Every page can have a different one – attachments included." },
            { title: "A sealed notebook", text: "Everything is encrypted, including the names of pages and attachments on disk. The passphrase is asked for when you open it." },
        ],
        table: {
            head: ["Protection", "Password", "File names", "Good for"],
            rows: [
                ["Vault", "One for all protected pages", "Page names visible", "Several confidential pages with one key"],
                ["Own password", "One per page", "Page name visible", "Single pages with separate access"],
                ["Sealed notebook", "One for the whole notebook", "Page and attachment names hidden", "Protecting everything, revealing nothing"],
            ],
        },
        shots: ["password", "locked"],
    },

    speed: {
        label: "Speed",
        title: "Quick – even as your collection grows.",
        lead: "Measured on a sample notebook with 2,000 pages and 13.7 MB of text.",
        stats: [
            ["1.0 s", "from starting the EXE to the notebook being open"],
            ["51 ms", "full-text search across all 2,000 pages"],
            ["33 ms", "per keystroke while typing on a normal page"],
            ["4.3 MB", "the whole app – one portable EXE, no installation"],
        ],
        method:
            "Figures for version 0.1.0 (release build) on the development computer, measured with the script <code>tests/perf/perf.mjs</code> from the source code. Other computers will differ. The program itself uses about 70 MB of memory; the WebView2 runtime comes on top (about 540 MB in total in this test).",
    },

    privacy: {
        label: "Privacy & control",
        title: "Your files. Your decision.",
        cards: [
            { title: "Everything stays local", text: "No account, no cloud, no telemetry. Your notes leave your computer only when you pass them on yourself." },
            { title: "Files, not a database", text: "Unprotected pages are text files in a folder of your choice. Back them up, search them or version them with any tool." },
            { title: "Portable", text: "One EXE and a folder. Settings sit beside it in mumbin_data, not in the registry. Copy everything to a USB stick or another PC." },
            { title: "A sealed-off interface", text: "The interface loads no third-party content and blocks external requests. You open links on purpose, in your browser or the matching program." },
            { title: "Verifiable", text: "The source code is publicly viewable. Automated tests cover the core, the interface and the real EXE – including encryption and attacks on file names." },
            { title: "An emergency exit", text: "An independent Python tool decrypts your notebook with the right password, even if Mumbin is no longer around." },
        ],
    },

    download: {
        label: "Download",
        title: "Get Mumbin",
        text: "One portable EXE. Download it, put it in a folder, run it – no installation.",
        button: "Download Mumbin",
        release: "Release & SHA-256 on GitHub ↗",
        file: "mumbin.exe",
        psst: "Psst … just for you.",
        specs: [
            ["Version", "0.1.0 (preview)"],
            ["System", "Windows 10 or 11, 64-bit"],
            ["Runtime", "Microsoft Edge WebView2 (already on many PCs)"],
            ["Size", "≈ 4.3 MB · .exe"],
            ["Installation", "None – copy and run"],
            ["Signature", "Unsigned; Windows may show a warning"],
        ],
        verify: "Compare the file's checksum:",
        command: "Get-FileHash mumbin.exe -Algorithm SHA256",
        tool: "Download the decryption tool (Python) ↓",
        toolGuide: "Guide ↗",
        steps: [
            ["Download", "Download mumbin.exe and put it in a folder you can write to."],
            ["Start", "Run the EXE. The first time you choose the folder for your notebook."],
            ["Begin", "Write a page, link it to a second one and protect what should stay private."],
        ],
    },

    gallery: { label: "Screenshots", title: "What Mumbin looks like", lead: "Real images of the current version with synthetic sample data. Click to enlarge." },

    blog: {
        label: "Blog",
        title: "Know-how on notes, privacy and staying organised",
        lead: "Articles and step-by-step guides: use cases, encryption and everyday life with Mumbin.",
        read: "Read →",
        all: "All posts →",
        back: "All posts",
        indexTitle: "Blog: Notes, Knowledge and Privacy with Mumbin",
        indexDescription: "Articles and guides about encrypted notes: use cases, the benefits of local storage, security explained and everyday life with Mumbin on Windows.",
        indexLead: "Plain-language articles on use cases, benefits and security – plus step-by-step guides to get started.",
        faqTitle: "Frequently asked questions",
        minutes: "min read",
        home: "Mumbin",
        kindArticle: "Article",
        kindGuide: "Guide",
        quoteOpen: "“",
        quoteClose: "”",
    },

    guides: {
        label: "Guides",
        title: "Understand and get started",
        lead: "Three guides walk you through the most important workflows, step by step.",
        read: "Read the guide →",
        back: "All guides",
        next: "Continue with",
        minutes: "min read",
    },

    fit: {
        label: "Is Mumbin right for you?",
        title: "Your knowledge. Your way of working.",
        yesTitle: "A good fit if you …",
        yes: [
            "work personally on Windows and want to write offline too.",
            "want to keep notes, documents, tasks and material in context.",
            "look for local files and built-in password protection.",
            "want to protect single pages with separate passwords.",
        ],
    },

    faq: {
        label: "FAQ",
        title: "Good to know",
        items: [
            ["What can I keep in Mumbin?", "Formatted text, tables, pictures and any file as an attachment, for example PDFs, scans or spreadsheets. Everything stays in your notebook folder. Mumbin shows pictures and opens other files with the matching program."],
            ["Do I have to install anything?", "No. Mumbin is a portable EXE: put it in a folder you can write to and run it. Settings are stored beside it in <code>mumbin_data</code>. It needs the Microsoft Edge WebView2 runtime, which many Windows PCs already have."],
            ["Does Mumbin send my notes to the internet?", "No. The app stores notes locally and has no cloud connection and no telemetry. Links you click on purpose open your browser or the matching program. This website is served by GitHub Pages, independently of the app."],
            ["How secure is the encryption?", "Mumbin derives the key from your password with Argon2id and encrypts with XChaCha20-Poly1305; if someone alters a file, decryption notices. The format is open: you can read it in the source code and in the Python tool."],
            ["Who owns my password?", "Only you. There is no back door – so nobody but you can open your protected pages, not even the independent tool without your password. Keep it safe and back up your notebook folder."],
            ["Which protection should I choose?", "For single confidential pages a password of their own is enough. The vault protects several pages with one key. If the names of pages and attachments should be hidden too, choose sealing when you create the notebook."],
            ["Will my notes stay readable if Mumbin disappears?", "Unprotected pages are plain text files. You open protected pages with the included Python tool and your password – without Mumbin."],
            ["Can I use my notes on several PCs?", "Yes: copy the notebook folder and the EXE, for example on a USB stick, or mirror the folder with a file-sync service of your choice. That way your notes are with you everywhere – without an account."],
            ["Can I export or print my notes?", "Yes. A page, a branch or the whole notebook can be exported as HTML; pages can be printed. Unlocked protected pages appear in plain text in an export."],
            ["How do tasks work?", "You write a checkbox into a note, optionally with a start and a deadline. The task overview collects all tasks of your pages, grouped by note or as one list."],
            ["Can I bring existing texts and files along?", "Yes: paste texts straight into a page and keep files as attachments. Everything ends up in your notebook folder."],
        ],
    },

    closing: {
        peek: "I have been waiting.",
        title: "Start with one page.",
        text: "Download one file, create a notebook and begin. Everything else grows with your ideas.",
    },

    footer: { tagline: "Local notes. Your own thoughts.", privacy: "Privacy", license: "Licence", licenses: "Third-party", rights: "© 2026 markMarkinson. All rights reserved." },

    privacyPage: {
        title: "Privacy",
        seoTitle: "Privacy at Mumbin: no trackers, no tracking cookies",
        body: "This static website is hosted on GitHub Pages. It uses no analytics, tracking cookies or externally loaded fonts. The screenshots show only synthetic sample content. GitHub processes connection data needed to serve the website and downloads. GitHub describes its data processing in its privacy statement. Links to GitHub and other websites take you to external services.",
        back: "Back to the website",
    },

    shots: {
        overview: ["Mumbin with a sample page: page tree, picture, table and backlinks", "A page with a picture, a table and backlinks"],
        write: ["A page with a table and tasks while writing", "Tables, lists and tasks right in the text"],
        links: ["Backlinks below the page tree", "Backlinks: who links to this page?"],
        tags: ["Tag cloud below the page tree", "Tags organise across the page structure"],
        search: ["Search results with previews in the sidebar", "Search shows hits with a preview"],
        tasks: ["Task overview grouped by note with deadlines", "Tasks grouped by note, with start and deadline"],
        taskdates: ["Dialog for setting the start and deadline of a task", "Start and deadline with a date picker (optional)"],
        "protect-menu": ["Page menu with the protection options and export", "The page menu: encrypt, export, print"],
        password: ["Dialog for protecting a page with its own password, with strength meter", "A password of its own for this page"],
        locked: ["Locked page with a padlock and an unlock button", "Locked, the content stays hidden"],
        contextmenu: ["Own right-click menu in the text", "The right-click menu in the style of the app"],
        settings: ["Settings with the group This notebook", "Settings per notebook: recycle bin, encryption, template"],
        language: ["Mumbin with the German interface", "The interface can be switched to German"],
        notebooks: ["Notebook switcher with three notebooks", "Several notebooks, each in its own folder"],
    },

    guideList: [
        {
            slug: "encrypt-notes",
            short: "Encrypt notes",
            seoTitle: "Encrypt Notes: Vault, Page Password or Sealed Notebook | Mumbin",
            minutes: 6,
            title: "Encrypt notes: vault, a password of its own, or a sealed notebook",
            lead: "Three ways to protect pages – and how to find the right one. With steps for each.",
            card: "Which protection suits which note? Step by step: a password per page, the shared vault and the sealed notebook.",
            body: `
<h2>The three kinds of protection</h2>
<p>Mumbin protects notes on disk. You choose per page or per notebook:</p>
<ul>
  <li><strong>A password of its own for a page:</strong> the page (and its attachments) opens only with its password. Every page can have a different one.</li>
  <li><strong>The notebook's vault:</strong> one passphrase protects all the pages you hand to the vault.</li>
  <li><strong>A sealed notebook:</strong> everything is encrypted, including the names of pages and attachments on disk.</li>
</ul>
<p>The tip: if the <em>names</em> of your pages should stay hidden too, seal the notebook – then the names of pages and attachments are encrypted too.</p>

<h2>Protect a single page with its own password</h2>
<ol>
  <li>Open the page in the page tree.</li>
  <li>In the sidebar click the arrow next to the <code>+</code> and choose <strong>“Protect page with its own password …”</strong>.</li>
  <li>Enter the password twice. The strength meter helps; the password must be at least ten characters long.</li>
  <li>Confirm with <strong>“Protect”</strong>.</li>
</ol>
[[shot:password]]
<p>The page stays open until you close it with <strong>“Lock page”</strong> in the page menu, the automatic lock kicks in, or you switch notebooks. A padlock in the page tree shows the state. A locked page shows an <strong>“Unlock …”</strong> button instead of its text and asks for the password of exactly this page.</p>
[[shot:locked]]
<p>The same menu offers <strong>“Change password …”</strong> and <strong>“Remove protection …”</strong>. The password of a page belongs to you alone: there is no back door, so keep it safe.</p>

<h2>Protect several pages with a vault</h2>
<ol>
  <li>Open the gear menu and choose <strong>“Manage encryption …”</strong>.</li>
  <li>Click <strong>“Set up …”</strong> and choose a passphrase.</li>
  <li>Encrypt pages one by one with <strong>“Encrypt page”</strong> in the page menu, or all at once with <strong>“Encrypt all pages”</strong>.</li>
</ol>
<p>In the settings under <strong>“This notebook”</strong> you can have new pages encrypted automatically. In the “Manage encryption” dialog you set the automatic lock after a period of inactivity.</p>

<h2>Seal a whole notebook</h2>
<p>When you create a new notebook, Mumbin asks: <strong>“Protect the new notebook with a passphrase?”</strong>. If you choose <strong>“Protect with passphrase”</strong>, everything is encrypted – every page, every attachment and even their names on disk. Mumbin asks for the passphrase when you open it. You choose a sealed notebook right when you create it.</p>

`,
        },
        {
            slug: "tasks-with-deadlines",
            short: "Tasks with deadlines",
            seoTitle: "Manage Tasks with Deadlines in Your Notes | Mumbin",
            minutes: 4,
            title: "Tasks with a start and a deadline in your notes",
            lead: "Tasks stay in the note where they began. Here is how to set a start and a deadline and keep an overview.",
            card: "Write a checkbox into a note, set a start and a deadline with a date picker and see it all in the task overview.",
            body: `
<h2>Write a task</h2>
<p>A task is a line with a checkbox. Click the checkbox symbol (<code>☐</code>) in the format bar or write <code>[ ] text</code>. Lines that begin with <code>TODO:</code> count as tasks too.</p>
<ul>
  <li>Mark importance with <code>!</code> or <code>!!</code>.</li>
  <li>Add a keyword with <code>@name</code>.</li>
  <li>Indented lines are subtasks.</li>
</ul>

<h2>Set a start and a deadline</h2>
<p>Both are optional. Mumbin reads <code>&gt;2026-12-01</code> as the <strong>start</strong> and <code>&lt;2026-12-31</code> as the <strong>deadline</strong> at the end of the line. You do not have to type the characters:</p>
<ol>
  <li><strong>In the editor:</strong> put the cursor in the task and press <code>Ctrl+Shift+D</code>. Or click the calendar button in the format bar (<code>Ctrl+D</code>): on a task the list starts with “Set start and deadline of the task …”.</li>
  <li><strong>In the task overview:</strong> hover over a task and click the calendar button on the right.</li>
</ol>
[[shot:taskdates]]
<p>Empty fields remove the date again. Mumbin writes it as text into the line, so you always see it right in the note.</p>

<h2>The task overview</h2>
<p>Click <strong>“Tasks”</strong> at the top left. The overview collects all tasks of your pages – grouped by note by default; the <strong>“By note”</strong> button switches to a single list.</p>
[[shot:tasks]]
<ul>
  <li><strong>Open:</strong> everything not done yet.</li>
  <li><strong>Active:</strong> tasks you can start now (no later start date).</li>
  <li><strong>Waiting:</strong> marked with “waiting” or “planned”.</li>
  <li><strong>Due:</strong> the deadline is today or past.</li>
  <li><strong>Done:</strong> ticked off.</li>
</ul>
<p>A click on the checkbox ticks it off, a click on the text jumps into the note. The field at the top filters by words and <code>@tags</code>. Locked pages do not appear in the overview.</p>
`,
        },
        {
            slug: "take-your-notebook",
            short: "Take your notebook",
            seoTitle: "Back Up, Carry and Open Your Notebook Without Mumbin",
            minutes: 4,
            title: "Back up your notebook, take it along and open it without Mumbin",
            lead: "Your notebook is a folder. Here is how to back it up, take it with you and still reach protected content without Mumbin.",
            card: "Copy a folder, continue on another PC, pass it on as HTML and decrypt it with the Python tool.",
            body: `
<h2>A notebook is a folder</h2>
<p>Every notebook lives in a folder of your choice. Unprotected pages are plain text files; attachments sit in folders next to them:</p>
<div class="code">My-Notebook/ ├─ notebook.mumbin ├─ My_Notes.txt ├─ Iceland-Trip.txt └─ Iceland-Trip/aurora.png</div>
<p>To <strong>back up</strong>, copy the folder. Wait until Mumbin shows “saved”, or close the program first. For <strong>another PC</strong> copy the folder and <code>mumbin.exe</code>; your personal settings are in the <code>mumbin_data</code> folder next to the EXE.</p>

<h2>Pass on as HTML or print</h2>
<p>In the page menu (the arrow next to the <code>+</code>) you find <strong>“Export page and sub-pages as HTML …”</strong> and <strong>“Export the whole notebook as HTML …”</strong>. The export writes files into a new folder and overwrites nothing. <strong>“Print the page”</strong> prints a page. Locked pages are missing from an export. Unlocked protected pages are exported in plain text – keep that in mind before you pass an export on.</p>
[[shot:protect-menu]]

<h2>Open protected content without Mumbin</h2>
<p>If Mumbin is ever no longer available, the independent Python tool and your password get you to all protected pages and attachments. It reads the notebook folder and writes a decrypted copy into a <strong>new</strong> folder.</p>
<ol>
  <li>Install Python 3 and the package <code>pynacl</code>: <code>pip install pynacl</code></li>
  <li>Download <a class="text-link" href="{{tool}}">mumbin_decrypt.py</a>.</li>
  <li>Run: <code>python mumbin_decrypt.py "C:\\Notes\\MyBook" --out "C:\\Notes\\MyBook-open"</code></li>
</ol>
<p>For pages with a <strong>password of their own</strong> set the environment variable <code>MUMBIN_PAGE_PASSWORD</code> or type the password when the tool asks for it. The result is an ordinary notebook of text files. Nothing works without the right password – not even for us.</p>
`,
        },
    ],
};

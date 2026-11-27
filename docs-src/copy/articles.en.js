// Articles (English), in the same order as articles.de.js: the n-th German article is the translation partner of
// the n-th English one. Placeholders: [[shot:name]], {{article:slug}}, {{guideLink:slug}}, {{download}}, {{tool}}.

module.exports = [
    {
        slug: "free-encrypted-notes-app-windows",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Free Note-Taking App for Windows: Encrypted & Offline | Mumbin",
        title: "A free note-taking app for Windows: encrypted, offline and no account needed",
        description: "Mumbin is a free note-taking app for Windows: no account, no installation, works offline and has strong encryption. Here is what it does and how to start.",
        lead: "A note-taking app should be fast, keep things tidy and protect your thoughts. Mumbin does all that in one portable file – free, with no sign-up.",
        card: "What Mumbin can do as a free note-taking app for Windows – and how to start in three steps.",
        related: ["notes-without-cloud", "how-secure-is-mumbin", "use-cases"],
        faq: [
            ["Is Mumbin really free?", "Yes. You can download and use Mumbin for free, for personal use and internally in a business. The source code is publicly viewable; the exact terms are in the licence file on GitHub."],
            ["Do I need an account or a sign-up?", "No. There is no account and no sign-in. You start the EXE, choose a folder for your notebook and start writing."],
            ["Why does Windows show a warning the first time I start it?", "The executable is not digitally signed, so Windows may show a notice. You can compare the SHA-256 checksum of the downloaded file with the value on the release page to make sure it is unchanged."],
        ],
        body: `
<h2>What a good note-taking app offers</h2>
<p>When you keep notes digitally you want three things above all: to capture them quickly, to find them again later and to be sure they stay private. Mumbin is built for exactly that. It is a note-taking app for Windows 10 and 11 that runs on your computer and stores your texts as files in a folder you choose yourself.</p>
[[shot:overview]]

<h2>The main features at a glance</h2>
<ul>
  <li><strong>Writing with formatting:</strong> headings, lists, tables, pictures and code look the way they are meant to, right away.</li>
  <li><strong>Linking:</strong> pages sit in a tree and refer to each other; backlinks show where a page is mentioned.</li>
  <li><strong>Finding:</strong> search covers titles and text and shows a preview for every hit.</li>
  <li><strong>Tasks:</strong> a checkbox in the note is enough, the task overview collects them all – with a start and a deadline if you like.</li>
  <li><strong>Encrypting:</strong> per page, with a shared vault or as a sealed notebook. More in the guide {{guideLink:encrypt-notes}}.</li>
  <li><strong>Attachments:</strong> PDFs, scans, spreadsheets and any other files go right beside the page.</li>
</ul>

<h2>No account, no installation</h2>
<p>Mumbin is a single EXE file of about 4.3 megabytes. There is no installer and no user account. The program keeps your settings in the <code>mumbin_data</code> folder next to the EXE, not in the Windows registry. That means you can take everything along on a USB stick. More about this benefit in the article <a class="text-link" href="{{article:portable-notes-app-usb-stick}}">A portable notes app</a>.</p>

<h2>Start in three steps</h2>
<ol>
  <li><strong>Download:</strong> get <a class="text-link" href="{{download}}">mumbin.exe</a> and put it in a folder you can write to.</li>
  <li><strong>Run:</strong> the first time, you choose the folder for your notebook. If the Microsoft Edge WebView2 runtime is missing (many Windows PCs already have it), you install it once.</li>
  <li><strong>Get going:</strong> write your first page, link it to a second one and protect what should stay private.</li>
</ol>

<h2>Who is Mumbin for?</h2>
<p>Mumbin suits anyone who works on their own under Windows and wants to keep notes locally and protected: for studying and research, projects, travel, a journal and collections of knowledge. You will find concrete ideas in the article <a class="text-link" href="{{article:use-cases}}">Everyday use cases</a>.</p>
`,
    },
    {
        slug: "notes-without-cloud",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Keep Notes Offline Without the Cloud: Benefits & Setup | Mumbin",
        title: "Keep notes without the cloud: local, offline and under your control",
        description: "Store notes locally instead of in the cloud: the benefits of offline notes and how to set it up with Mumbin – no account and no telemetry.",
        lead: "Your notes live as files on your computer, not on someone else's servers. That makes them fast, available at any time and entirely your own business.",
        card: "Why local notes are practical, what you gain and how to work without the cloud with Mumbin.",
        related: ["own-your-notes", "portable-notes-app-usb-stick", "how-secure-is-mumbin"],
        faq: [
            ["Does Mumbin send notes to a server?", "No. Mumbin has no cloud connection, no account and no telemetry. Your notes leave your computer only if you pass them on yourself."],
            ["Does Mumbin work without internet?", "Yes. Every feature works offline. You only need a connection to download the EXE or to open links you click on purpose."],
            ["How do I back up local notes?", "A notebook is an ordinary folder. You copy it to an external drive, a USB stick or a backup program of your choice."],
        ],
        body: `
<h2>What “without the cloud” means</h2>
<p>With a local notes app your texts live on your own hard drive. Nothing is uploaded automatically, and you need neither a user account nor an internet connection. Mumbin works exactly like that: every notebook is a folder of text files that you choose yourself.</p>

<h2>What you gain with local notes</h2>
<ul>
  <li><strong>Control:</strong> you decide where the files are, who sees them and when they are deleted.</li>
  <li><strong>Speed:</strong> there is no waiting for servers. In a sample notebook with 2,000 pages, full-text search finishes in about 51 milliseconds.</li>
  <li><strong>Availability:</strong> your notes are there on the train, on a plane and during a network outage, just as always.</li>
  <li><strong>Privacy:</strong> with no account and no telemetry, no usage data is created anywhere.</li>
  <li><strong>Simplicity:</strong> no subscriptions, no sign-in, no sync errors.</li>
</ul>
[[shot:search]]

<h2>How to work locally with Mumbin</h2>
<ol>
  <li>Start the portable EXE and choose a folder, for example under <em>Documents</em>.</li>
  <li>Write your pages. Mumbin saves them as text files in that folder; attachments sit in folders beside them.</li>
  <li>Protect confidential pages with a password of their own or the vault. The rest is in the guide {{guideLink:encrypt-notes}}.</li>
  <li>Back the folder up regularly, as you do with other important files.</li>
</ol>

<h2>Local, yet with you everywhere</h2>
<p>Local does not mean tied to one computer. Copy the notebook folder with the EXE onto a USB stick or mirror it with a file-sync service of your choice. That way you take your notes along without Mumbin asking for an account. The details are in the guide {{guideLink:take-your-notebook}}.</p>

<h2>Privacy from the start</h2>
<p>Because the app sends no data to third parties, questions about where your notes are stored or who has access never come up. The interface loads no outside content and blocks external requests. How encryption and the program fit together is explained in the article <a class="text-link" href="{{article:how-secure-is-mumbin}}">How secure is Mumbin?</a></p>
`,
    },
    {
        slug: "how-secure-is-mumbin",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "How Secure Is Mumbin? Encryption Explained Simply",
        title: "How secure is Mumbin? The encryption explained simply",
        description: "Argon2id, XChaCha20-Poly1305 and no access without your password: how Mumbin protects your notes and how to keep security high with a few simple habits.",
        lead: "Mumbin protects notes with proven, openly documented methods. Here is a plain-language look at what is behind it and how to get the most out of it.",
        card: "Argon2id, XChaCha20-Poly1305, vault and sealing explained – and how you can tell the protection is sound.",
        related: ["own-your-notes", "confidential-work-notes", "encrypted-digital-journal"],
        faq: [
            ["Which encryption does Mumbin use?", "Mumbin derives the key from your password with Argon2id and encrypts the content with XChaCha20-Poly1305. Both methods come from the libsodium cryptography library and are considered modern and well studied."],
            ["Is there a back door or password recovery?", "No. The password belongs to you alone. That is why there is no back door and nobody but you can open protected pages. Keep your password safe."],
            ["Can I check the encryption myself?", "Yes. The source code is publicly viewable, and the format is described at the top of the independent Python tool, which opens protected content with your password even without Mumbin."],
        ],
        body: `
<h2>The principle in one sentence</h2>
<p>Your password is turned into a strong key, and that key encrypts your pages and attachments so that without the password they look like random data.</p>

<h2>The building blocks</h2>
<ul>
  <li><strong>Argon2id</strong> derives the key from your password. The method is deliberately demanding in computing time and memory, so guessing at scale becomes laborious.</li>
  <li><strong>XChaCha20-Poly1305</strong> encrypts the content. It is an authenticated method: if someone alters an encrypted file, decryption notices.</li>
  <li><strong>A well-checked library:</strong> both methods come from libsodium, a widely used and well-reviewed cryptography library.</li>
</ul>

<h2>Three kinds of protection for different needs</h2>
<p>You choose how much protection you need:</p>
<ul>
  <li><strong>A password per page:</strong> separate access for single pages with their attachments.</li>
  <li><strong>Vault:</strong> one passphrase protects every page you hand to the vault.</li>
  <li><strong>Sealed notebook:</strong> everything is encrypted, even the names of pages and attachments on disk.</li>
</ul>
[[shot:protect-menu]]
<p>The steps for each variant are in the guide {{guideLink:encrypt-notes}}.</p>

<h2>Locked really means locked</h2>
<p>A locked page shows only the unlock button. While it is locked, Mumbin keeps no keys in memory. Locked content deliberately does not appear in search, the task overview or exports. The automatic lock closes open pages after an idle time that you set.</p>
[[shot:locked]]

<h2>Open and verifiable</h2>
<p>Trust comes from being able to check. The source code of Mumbin is publicly viewable, automated tests cover encryption and attacks on file names, and an independent Python tool decrypts your notebook with the right password even without Mumbin. So you do not depend on a single program.</p>

<h2>How to get the most out of it</h2>
<ul>
  <li>Choose a long password or a passphrase of several words. For page passwords Mumbin requires at least ten characters.</li>
  <li>Use a password for your notebook that you use nowhere else.</li>
  <li>Keep the password safe, for example in a password manager.</li>
  <li>Back up the notebook folder regularly; with encrypted notebooks that is simply copying, too.</li>
  <li>When you export, unlocked pages are written in plain text. Pass exports on deliberately.</li>
</ul>
`,
    },
    {
        slug: "use-cases",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "What Is Mumbin Used For? 9 Everyday Use Cases",
        title: "What is Mumbin used for? Nine everyday use cases",
        description: "From a journal to studying to project planning: nine use cases show how to link notes, documents and tasks with Mumbin and keep them safe.",
        lead: "Mumbin keeps texts, files, tables and tasks together. These nine ideas show how versatile that is in everyday life.",
        card: "Journal, studies, travel, projects, documents and more: how to use Mumbin in daily life.",
        related: ["personal-knowledge-base", "encrypted-digital-journal", "confidential-work-notes"],
        faq: [
            ["Can I keep files such as PDFs in Mumbin?", "Yes. You put any file beside a page as an attachment, for example PDFs, scans or spreadsheets. They stay in your notebook folder and can be encrypted together with the page."],
            ["Can I keep several notebooks?", "Yes. You switch between notebooks with one click, and each lives in its own folder with its own settings."],
        ],
        body: `
<h2>1. Keep a digital journal</h2>
<p>Write one page a day and protect it with a password of its own, or create a sealed notebook right away. Tags such as <code>@grateful</code> or <code>@idea</code> organise entries across the order of dates. More in the article <a class="text-link" href="{{article:encrypted-digital-journal}}">Keep an encrypted digital journal</a>.</p>

<h2>2. Learn and study</h2>
<p>Create a page per subject with subpages for lectures, link terms to each other and use backlinks to see connections. Search finds definitions in seconds, and tasks with a deadline remind you of due dates.</p>

<h2>3. Plan trips</h2>
<p>Collect destinations, booking confirmations as PDFs, packing lists and daily plans on one page per trip. You simply drag pictures into the page. On the road everything is available offline.</p>

<h2>4. Keep projects and tasks in view</h2>
<p>Write tasks straight into the project note. The task overview collects all open, active and due items and groups them by note. You set a start and a deadline with a date picker. The steps are in the guide {{guideLink:tasks-with-deadlines}}.</p>
[[shot:tasks]]

<h2>5. Organise important documents</h2>
<p>Contracts, invoices and certificates can be collected as attachments on a page. With a vault or a sealed notebook, even the file names stay hidden.</p>

<h2>6. Build a knowledge collection</h2>
<p>Record what you learn, recipes, instructions or finds and connect them with links and tags. How that becomes a personal web of knowledge is shown in the article <a class="text-link" href="{{article:personal-knowledge-base}}">Build a personal knowledge base</a>.</p>

<h2>7. Collect research and ideas</h2>
<p>For articles, theses or design ideas you keep sources, quotes and pictures in one place. Search with phrases, exclusions and tags helps you find them again.</p>

<h2>8. Confidential work notes</h2>
<p>Meeting notes, drafts and client information stay local and can be separated with a password per page. Background in <a class="text-link" href="{{article:confidential-work-notes}}">Confidential notes at work</a>.</p>

<h2>9. Take your notes with you</h2>
<p>A notebook is a folder: copy it with the EXE onto a USB stick and continue on another PC. More in the article <a class="text-link" href="{{article:portable-notes-app-usb-stick}}">A portable notes app</a>.</p>

<h2>Start small</h2>
<p>You do not need a big plan. One page is enough to begin, and the rest grows with you. <a class="text-link" href="{{download}}">Download Mumbin</a> and try the use case that appeals to you most.</p>
`,
    },
    {
        slug: "personal-knowledge-base",
        minutes: 6,
        date: "2026-11-20",
        seoTitle: "Build a Personal Knowledge Base: Links, Tags, Search | Mumbin",
        title: "Build a personal knowledge base: with backlinks, tags and search",
        description: "How loose notes grow into a personal knowledge base: link pages, use backlinks, organise with tags and find everything in seconds – locally in Mumbin.",
        lead: "A knowledge base is made of small, linked notes. With a page tree, backlinks and tags, your collection becomes a web in which you quickly find your way.",
        card: "Link pages, use backlinks, organise with tags and search instantly: how a web of knowledge is born.",
        related: ["use-cases", "own-your-notes", "free-encrypted-notes-app-windows"],
        faq: [
            ["What are backlinks?", "A backlink shows you, on every page, which other pages link to it. That way you discover connections you did not have in mind while writing."],
            ["Do links break when I rename pages?", "No. When you rename or move a page, Mumbin carries the links along so that references stay intact."],
        ],
        body: `
<h2>What makes a knowledge base</h2>
<p>We all know it: good ideas are written down somewhere, but where? A personal knowledge base solves that by not only storing notes but connecting them. Each page covers one topic, and links show how the topics relate. Mumbin is built for this, yet stays calm and simple.</p>

<h2>Step 1: Set up a structure in the page tree</h2>
<p>Pages sit in a tree with subpages. Start roughly, for example with <em>Projects</em>, <em>Knowledge</em> and <em>Personal</em>, and create single topics beneath. You can rename or move pages at any time without breaking references.</p>
[[shot:overview]]

<h2>Step 2: Link pages to each other</h2>
<p>Link related pages right in the text. Below the page tree, backlinks show for every page who refers to it. Your knowledge grows in both directions.</p>
[[shot:links]]

<h2>Step 3: Organise across with tags</h2>
<p>Tags such as <code>@idea</code>, <code>@reading</code> or <code>@important</code> organise pages independently of their place in the tree. The tag cloud shows which topics matter to you.</p>
[[shot:tags]]

<h2>Step 4: Find things fast</h2>
<p>Search covers titles and text. Quotation marks find phrases, a minus excludes terms, and <code>@tag</code> or a page name narrows things down. Ctrl+J jumps to any page in seconds. Even in a sample notebook with 2,000 pages, full-text search returns its hits in about 51 milliseconds.</p>

<h2>Step 5: Add tasks and attachments</h2>
<p>A topic often comes with tasks and files. You put both right at the page: checkboxes are collected in the task overview, PDFs and pictures stay with it as attachments.</p>

<h2>Does your knowledge stay yours?</h2>
<p>Yes: everything lives locally as text files in a folder. If pages are confidential, you protect them with a password or create a sealed notebook right away. More in the guide {{guideLink:encrypt-notes}}.</p>
`,
    },
    {
        slug: "encrypted-digital-journal",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Keep an Encrypted Digital Journal: Step-by-Step | Mumbin",
        title: "Keep an encrypted digital journal: private, offline and well organised",
        description: "A digital journal that belongs only to you: how to keep it in Mumbin offline, well organised and with a password or as a completely sealed notebook.",
        lead: "A journal is personal. With a sealed notebook it stays that way on your computer: encrypted, offline and readable only with your password.",
        card: "How to create an encrypted journal: offline, with a password and, if you like, with hidden file names.",
        related: ["how-secure-is-mumbin", "use-cases", "notes-without-cloud"],
        faq: [
            ["Are the page names of a journal encrypted too?", "Yes, if you seal the notebook when you create it. Then every page, every attachment and even their names on disk are encrypted."],
            ["Can I protect only some entries?", "Yes. Every page can get a password of its own. You can mix open and protected pages in one notebook."],
        ],
        body: `
<h2>Why a digital journal?</h2>
<p>On a computer you write faster, can search entries and put photos or files right beside them. To keep the journal private anyway, it needs protection that fits the subject. Mumbin stores everything locally and offers three kinds of protection, from single pages to a completely sealed notebook.</p>

<h2>The best option: a sealed notebook</h2>
<p>When you create a new notebook, Mumbin asks whether you want to protect it with a passphrase. If you do, everything is encrypted: every page, every attachment and even the names on disk. Anyone who opens the folder sees only unreadable files. At start you enter your passphrase, and the journal opens.</p>
[[shot:notebooks]]

<h2>One entry per day</h2>
<ol>
  <li>Create a page <em>Journal</em> with subpages per year or month.</li>
  <li>Write one page per day, for example <code>2026-11-20</code>. With a page template, every entry starts with your usual layout.</li>
  <li>Add tags such as <code>@grateful</code> or <code>@ideas</code> to find entries by topic later.</li>
  <li>Add photos and other files as attachments.</li>
</ol>

<h2>Finding and looking back</h2>
<p>Search finds words and phrases in every entry. The tag cloud shows which topics occupy you most. One thing to know: locked pages deliberately do not appear in hits – as long as the journal is locked, everything stays hidden.</p>

<h2>Good habits</h2>
<ul>
  <li>Choose a passphrase you can remember and use nowhere else.</li>
  <li>Keep it safe, because there is no back door.</li>
  <li>Back up the notebook folder regularly on a second drive.</li>
</ul>
<p>How the encryption works in detail is explained in the article <a class="text-link" href="{{article:how-secure-is-mumbin}}">How secure is Mumbin?</a> You find the steps to set it up in the guide {{guideLink:encrypt-notes}}.</p>
`,
    },
    {
        slug: "portable-notes-app-usb-stick",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Portable Notes App for a USB Stick: Take Notes Anywhere",
        title: "A portable notes app: use your notes on a USB stick and on several PCs",
        description: "A portable notes app with no installation: Mumbin and your notebook fit on a USB stick. Work with the same notes on several Windows PCs.",
        lead: "One EXE and one folder: that is all Mumbin needs. It makes your notes mobile – from desk to laptop, from office to home.",
        card: "Put Mumbin and your notebook on a USB stick and keep working anywhere, with no installation.",
        related: ["notes-without-cloud", "free-encrypted-notes-app-windows", "own-your-notes"],
        faq: [
            ["Does Mumbin have to be installed?", "No. Mumbin is a portable EXE. You put it in a folder you can write to and run it. The settings sit in the mumbin_data folder beside it, not in the registry."],
            ["What do I need on the other PC?", "Windows 10 or 11 and the Microsoft Edge WebView2 runtime, which many Windows PCs already have."],
            ["Can I sync the same notebook folder across PCs?", "Yes. You can copy the folder with a USB stick or mirror it with a file-sync service of your choice. Open it on one computer at a time."],
        ],
        body: `
<h2>What “portable” means</h2>
<p>A portable application runs straight from a folder without installation. Mumbin is built that way: the file <code>mumbin.exe</code> is about 4.3 megabytes, and the settings sit in the <code>mumbin_data</code> folder beside it. You can put both on a USB stick and start them on any suitable Windows PC.</p>

<h2>Your notebook is a folder</h2>
<p>Every notebook lives in a folder. Unprotected pages are plain text files, attachments sit in folders beside them. That way a notebook can be copied, backed up and moved like any other folder:</p>
<div class="code">My-Notebook/ ├─ notebook.mumbin ├─ My_Notes.txt ├─ Iceland-Trip.txt └─ Iceland-Trip/aurora.png</div>

<h2>How to take everything along</h2>
<ol>
  <li>Close Mumbin or wait until “saved” is shown.</li>
  <li>Copy the notebook folder and <code>mumbin.exe</code> with its <code>mumbin_data</code> folder onto the USB stick.</li>
  <li>Start the EXE on the other PC and open the notebook folder.</li>
</ol>
<p>The detailed steps are in the guide {{guideLink:take-your-notebook}}.</p>

<h2>Protected on the move</h2>
<p>Encryption is especially worthwhile on a USB stick. If you lose the stick, pages with a password cannot be read without it, and with a sealed notebook even the file names stay hidden. The kinds of protection are explained in the guide {{guideLink:encrypt-notes}}.</p>
[[shot:password]]

<h2>Several PCs without an account</h2>
<p>Instead of a cloud account you use what you already have: a USB stick, an external drive or a file-sync service of your choice. Mumbin asks for no sign-in and sends no data to the internet. More benefits of local notes are described in the article <a class="text-link" href="{{article:notes-without-cloud}}">Keep notes without the cloud</a>.</p>
`,
    },
    {
        slug: "confidential-work-notes",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Confidential Work Notes: Encrypt Client Data Locally | Mumbin",
        title: "Confidential notes at work: protect client data and drafts locally",
        description: "Meeting notes, client data and drafts deserve protection: how to keep work notes local, encrypted and separated by password with Mumbin.",
        lead: "Work notes often contain confidential material. With local storage and encryption per page, control stays with you.",
        card: "Keep meeting notes and client data local, encrypt them per page and store them neatly separated.",
        related: ["how-secure-is-mumbin", "notes-without-cloud", "use-cases"],
        faq: [
            ["May I use Mumbin in a company?", "Yes. The licence allows using the unmodified program for personal use and internally in a business or organisation. The exact terms are in the licence file on GitHub."],
            ["Does Mumbin replace a data protection review?", "No. The software helps technically, because notes stay local and can be encrypted. Whether and how you may process personal data depends on the rules of your organisation and the law. This is not legal advice."],
        ],
        body: `
<h2>Why work notes deserve special protection</h2>
<p>Meeting notes, client information, draft offers, internal thoughts: much of it is meant only for you or your team. If you keep notes local and encrypt them selectively, you stay in control of where they are and who can see them.</p>

<h2>Local means: no passing on to third parties</h2>
<p>Mumbin has no cloud connection, no account and no telemetry. Your notes leave the computer only if you pass them on yourself. The interface loads no outside content and blocks external requests. That gives a simple starting point when you think about how to handle sensitive information.</p>

<h2>A password per client or project</h2>
<p>You can give every page a password of its own. That is handy when information about different clients or projects should stay separate. Attachments such as offers or contracts are encrypted together with the page. Alternatively the vault protects many pages with one shared passphrase.</p>
[[shot:protect-menu]]

<h2>Hide everything: the sealed notebook</h2>
<p>If even the name of a page would reveal something, such as a client name, create a sealed notebook. Then the names of pages and attachments on disk are encrypted too.</p>

<h2>Good practice in daily work</h2>
<ul>
  <li>Turn on the automatic lock so that open pages close again after an idle time.</li>
  <li>Back up the notebook folder according to the rules of your organisation.</li>
  <li>Remember that unlocked pages appear in plain text in exports.</li>
  <li>For data protection questions, turn to the responsible person in your organisation.</li>
</ul>
<p>How the encryption works is in the article <a class="text-link" href="{{article:how-secure-is-mumbin}}">How secure is Mumbin?</a>, the steps in the guide {{guideLink:encrypt-notes}}.</p>
`,
    },
    {
        slug: "own-your-notes",
        minutes: 5,
        date: "2026-11-20",
        seoTitle: "Own Your Notes: Plain Text Files and an Open Format | Mumbin",
        title: "Your notes belong to you: text files, open formats and an emergency exit",
        description: "Mumbin saves notes as ordinary text files in a folder. An open format and a Python tool open protected pages even without the app.",
        lead: "Good notes should outlast any program. That is why Mumbin stores them as simple files and even documents the encryption format.",
        card: "Text files, an open format and an independent tool: how your notes stay readable and portable.",
        related: ["how-secure-is-mumbin", "notes-without-cloud", "portable-notes-app-usb-stick"],
        faq: [
            ["In which format does Mumbin store notes?", "Unprotected pages are plain text files in a folder you choose. Attachments sit in folders beside them. The small file notebook.mumbin describes the notebook itself."],
            ["Can I export my notes?", "Yes. A page, a branch or the whole notebook can be exported as HTML. The export puts files in a new folder and overwrites nothing."],
        ],
        body: `
<h2>Files instead of a database</h2>
<p>Many note programs keep everything in a database of their own. Mumbin goes another way: every page is a text file. The notebook is an ordinary folder. You can back it up, search it or put it under version control with any program, and copy it with Windows' own tools.</p>

<h2>Why that is an advantage</h2>
<ul>
  <li><strong>Readability:</strong> if needed you open unprotected pages with a text editor.</li>
  <li><strong>Backup:</strong> backups are folder copies, with no special tool.</li>
  <li><strong>Independence:</strong> your notes depend on no account and no service.</li>
  <li><strong>Portability:</strong> a folder fits on any storage device.</li>
</ul>

<h2>Protected content stays accessible, too</h2>
<p>Encrypted pages are not a prison. The format is open: you can read it in the source code and at the top of the Python tool. With this independent tool and your password you decrypt a notebook even if Mumbin is no longer available. It writes a decrypted copy to a new folder and overwrites nothing.</p>
<div class="code">python mumbin_decrypt.py "C:\\Notes\\MyBook" --out "C:\\Notes\\MyBook-open"</div>
<p>The exact steps are in the guide {{guideLink:take-your-notebook}}. You can download the tool <a class="text-link" href="{{tool}}">here</a>. It needs Python 3 with the <code>pynacl</code> package.</p>

<h2>Pass on as HTML</h2>
<p>For readers who do not have Mumbin, you export pages as HTML or print them. Note that unlocked protected pages appear in plain text then.</p>
[[shot:settings]]

<h2>Verifiable instead of “trust us”</h2>
<p>The source code of Mumbin is publicly viewable. Automated tests cover the core, the interface and the real EXE, including encryption and attacks on file names. More about the protection in the article <a class="text-link" href="{{article:how-secure-is-mumbin}}">How secure is Mumbin?</a></p>
`,
    },
];

// Bundles third-party browser libraries into renderer/vendor/ so the
// renderer needs no bundler of its own and the exe embeds a single file.
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

esbuild
    .build({
        entryPoints: [path.join(__dirname, "vendorEntry.js")],
        outfile: path.join(root, "renderer", "vendor", "codemirror.js"),
        bundle: true,
        format: "esm",
        minify: true,
        target: "es2022",
        legalComments: "none",
        logLevel: "info",
    })
    .catch(() => process.exit(1));

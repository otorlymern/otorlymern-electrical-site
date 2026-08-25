export const PUBLIC_ROOT_DIRECTORIES = [
  "css",
  "fonts",
  "images",
  "manuals",
  "music",
  "oes-patch-builder",
  "services",
  "solutions",
  "store",
  "systems",
  "video",
];

export const PUBLIC_ROOT_FILES = [
  "Lyno-Jean 2.otf",
  "Lyno-Stan 2.otf",
  "Lyno-Ulys 2.otf",
  "Lyno-Walt 2.otf",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "apple-touch-icon.png",
  "cash3dcircleassetsolo.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon.ico",
  "index.html",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "tape-tex-72.png",
  "tape-tex100.png",
  "tapetex-05.png",
  "texture-PNG-by-PhotoshopSupply14.png",
];

export const EXCLUDED_PATH_PREFIXES = [
  "css/98.css-main",
  "css/system7.css",
  "gallery.html",
  "manuals/scripts",
  "output",
  "scripts",
  "solutions/techniques/musictech/tech_template.html",
  "solutions/techniques/vidtech/video-tech-template.html",
  "solutions/index.html",
  "systems/splash.html",
  "video/videolibraryv1.html",
  "video/viewingroom.html",
  "tmp",
  "Transparent Tape Textures",
];

export const EXCLUDED_PATH_SEGMENTS = new Set([
  ".agents",
  ".git",
  ".github",
  ".vscode",
  "_deploy",
  "_site",
  "node_modules",
]);

export const EXCLUDED_FILE_NAMES = new Set([
  ".DS_Store",
  ".editorconfig",
  ".gitignore",
  ".neocitiesignore",
  ".npmignore",
  "README.md",
  "bun.lockb",
  "package-lock.json",
  "package.json",
  "yarn.lock",
]);

// These files still have deliberate first-party links. Keep them public until
// each page is migrated to a verified Wasabi or PeerTube destination.
export const TEMPORARY_PUBLIC_BINARY_ALLOWLIST = new Set([
  "images/diagrams/pingpong-r2r.pdf",
  "solutions/DIY/projects/Ring MoulationAlternativesStephenBillow.pdf",
  "solutions/DIY/projects/vocalsynthesiuss.pdf",
  "video/0921.mp4",
]);

export const SOURCE_ONLY_EXTENSIONS = new Set([
  ".md",
  ".mjs",
  ".py",
  ".sh",
]);

export const LOCAL_MEDIA_EXTENSIONS = new Set([
  ".aif",
  ".aiff",
  ".avi",
  ".m4v",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".wav",
]);

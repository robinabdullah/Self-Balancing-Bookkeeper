import path from "node:path";

// The bundle ships the PDF fonts next to main.js (webpack.config.js).
process.env.PDF_FONT_DIR ??= path.join(__dirname, "fonts");

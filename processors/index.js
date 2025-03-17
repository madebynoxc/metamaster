import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(__dirname).filter(file => file.endsWith(".js") && file !== "index.js");

const imports = await Promise.all(files.map(file => import(join(__dirname, file))));

export default imports.map(module => module.default);
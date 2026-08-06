import { existsSync, readFileSync } from "node:fs";

const requiredIgnored = [
  ".env.local",
  ".env.*.local",
  "node_modules/",
  ".next/",
  ".vercel/",
];

const requiredFiles = [".gitignore", ".env.example", "package.json"];

const missingFiles = requiredFiles.filter((file) => !existsSync(file));
const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
const missingIgnored = requiredIgnored.filter((entry) => !gitignore.includes(entry));

if (missingFiles.length || missingIgnored.length) {
  console.error("Predeploy check failed.");
  if (missingFiles.length) {
    console.error("Missing files:", missingFiles.join(", "));
  }
  if (missingIgnored.length) {
    console.error("Missing .gitignore entries:", missingIgnored.join(", "));
  }
  process.exit(1);
}

console.log("Predeploy check OK: .gitignore and .env.example are ready.");

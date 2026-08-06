import { readFileSync, existsSync } from "node:fs";

const envPath = ".env.local";

const requiredGroups = [
  {
    label: "Google AI key",
    anyOf: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
  },
  {
    label: "Supabase URL",
    anyOf: ["NEXT_PUBLIC_SUPABASE_URL"],
  },
  {
    label: "Supabase anon key",
    anyOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
];

const recommended = ["SUPABASE_SERVICE_ROLE_KEY"];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .reduce((result, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return result;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        return result;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      result[key] = value;
      return result;
    }, {});
}

const env = parseEnvFile(envPath);
const missingGroups = requiredGroups.filter((group) =>
  group.anyOf.every((key) => !env[key])
);
const missingRecommended = recommended.filter((key) => !env[key]);

if (missingGroups.length) {
  console.error("Vercel env check failed. Missing required variables:");
  for (const group of missingGroups) {
    console.error(`- ${group.label}: ${group.anyOf.join(" or ")}`);
  }
  process.exit(1);
}

console.log("Vercel env check OK. Required variables are present in .env.local.");

if (missingRecommended.length) {
  console.log(
    `Recommended for Vercel if your Supabase backend needs admin operations: ${missingRecommended.join(", ")}`
  );
}

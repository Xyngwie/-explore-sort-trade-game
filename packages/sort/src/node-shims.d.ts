declare module "node:fs" {
  export function readdirSync(path: URL | string): string[];
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}

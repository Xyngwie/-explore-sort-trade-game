import { execSync } from "node:child_process";
export function gameVersionDefine(): Record<string,string> {
  let version=process.env.VITE_GAME_VERSION;
  if(!version){try{version=execSync("git rev-parse HEAD",{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();const root=execSync("git rev-parse --show-toplevel",{encoding:"utf8"}).trim();if(execSync("git status --porcelain -- packages",{cwd:root,encoding:"utf8"}).trim())version+="-dirty";}catch{version="unknown";}}
  return {__GAME_VERSION__:JSON.stringify(version)};
}

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function getGitInfo() {
  try {
    return {
      short: execSync("git rev-parse --short HEAD").toString().trim(),
      full: execSync("git rev-parse HEAD").toString().trim(),
    };
  } catch {
    return {
      short: "unknown",
      full: "",
    };
  }
}

const gitInfo = getGitInfo();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_COMMIT__: JSON.stringify(gitInfo.short),
    __GIT_COMMIT_URL__: JSON.stringify(
      gitInfo.full
        ? `https://github.com/Justme0606/release-maintainer/commit/${gitInfo.full}`
        : "#",
    ),
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const gitCommit = execSync('git rev-parse --short main').toString().trim()
const gitCommitFull = execSync('git rev-parse main').toString().trim()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GIT_COMMIT_URL__: JSON.stringify(
      `https://github.com/Justme0606/release-maintainer/commit/${gitCommitFull}`
    ),
  },
})

// Playwright runs tests/integration/ against dist-single/index.html, opened from
// disk: no dev server and no port (npm run test:e2e builds it first).
import { defineConfig } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The browser every check uses is the one .claude/scripts/page-shot.sh finds:
// PAGE_SHOT_BROWSER, then Chrome, Edge or Chromium, then a headless shell.
// Without the script, PAGE_SHOT_BROWSER as it is; with neither, Playwright's
// own browser (npx playwright install chromium-headless-shell).
function checkBrowser(): string | undefined {
  const script = '.claude/scripts/page-shot.sh';
  if (!existsSync(script)) return process.env.PAGE_SHOT_BROWSER || undefined;
  const r = spawnSync(bash(), [script, '--which'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : undefined;
}

// Git's bash on Windows: the first bash on the PATH there can be WSL's.
function bash(): string {
  if (process.platform !== 'win32') return 'bash';
  const found = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ].find(p => p && existsSync(p));
  return found ?? 'bash';
}

// On CI's machines (no GPU, two slow cores) the table takes over 30 s to load: the 45 MB single-file
// build is parsed and the 3D map's shaders compile in software. Slower limits there, the usual ones here.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/integration',
  forbidOnly: CI,
  timeout: CI ? 180_000 : 30_000,
  expect: { timeout: CI ? 30_000 : 5_000 },
  use: {
    viewport: { width: 1280, height: 720 },
    navigationTimeout: CI ? 150_000 : 30_000,
    actionTimeout: CI ? 30_000 : 0,
    launchOptions: {
      executablePath: checkBrowser(),
      // WebGL in software (SwiftShader), the same flags page-shot.sh --software
      // passes, so a check draws the same with a GPU or none. For checks only.
      // PW_GPU=1 (a local run on a machine with a GPU) draws with the GPU instead: 3-5 times faster, for
      // the checks that read the page rather than compare pictures. CI never sets it.
      args: process.env.PW_GPU === '1' ? [] : ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    },
  },
});

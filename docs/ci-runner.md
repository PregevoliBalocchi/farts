# CI runner

The workflows in `.github/workflows/` run on a **self-hosted runner**: the owner's Windows PC, with a GPU. GitHub
bills Actions minutes on its own machines for a private repository, but not on a self-hosted runner.

## Which machine runs the jobs

Every job has `runs-on: ${{ vars.RUNNER || 'self-hosted' }}`.

- **No `RUNNER` variable:** the self-hosted runner. The browser tests run in one job, two browsers at a time,
  drawn with the GPU (`PW_GPU=1`).
- **Repository variable `RUNNER` = `ubuntu-latest`:** GitHub's machines. The browser tests split into 7 jobs
  side by side, as before. Set it in Settings → Secrets and variables → Actions → Variables.

Jobs wait in the queue while the runner is off. A run waiting for a runner shows "Waiting for a runner to pick up
this job".

## Setting the runner up (once)

1. On GitHub, open the repository's Settings → Actions → Runners → **New self-hosted runner**, then choose
   **Windows** and **x64**. The page lists the commands to download the runner and its one-time
   registration token.
2. Open PowerShell (no administrator needed). First, make Git Bash reachable, as the steps are bash scripts. The
   runner records this PATH when it is configured:
   ```powershell
   $env:PATH = "C:\Program Files\Git\bin;$env:PATH"
   ```
3. Run the page's commands as shown: create `C:\actions-runner`, download, extract, then `./config.cmd --url …
   --token …`. Press Enter at every question (group, name, labels, work folder). Answer **N** to "run as
   service": a service runs without the desktop session, where Chrome has no GPU.
4. Start it with `./run.cmd` and leave the window open. It says "Listening for Jobs".

To start it again after a restart, open PowerShell, then:

```powershell
cd C:\actions-runner
./run.cmd
```

## What the runner needs

- Git for Windows, with `C:\Program Files\Git\bin` on the runner's PATH: `bash` runs the steps.
- Google Chrome or Edge: `.claude/scripts/page-shot.sh` finds it for Playwright.
- Node is installed by `actions/setup-node` (version 24).

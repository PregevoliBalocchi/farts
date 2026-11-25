# Session Subagent Cost

**Session:** `fe31058f-515b-4e0c-98e5-50d3a2eeee99`  
**Updated:** 20261125_185948

Subagent spawns this session: **11**

| Agent | Spawns |
|-------|--------|
| ui-programmer | 2 |
| localization-lead | 2 |
| gameplay-programmer | 2 |
| accessibility-specialist | 2 |
| ux-designer | 1 |
| qa-lead | 1 |
| game-designer | 1 |

Each spawn is a fresh context window that re-reads its own inputs.
To reduce this: lower `modes.review_mode` (`/project-settings modes.review_mode=solo`)
or `modes.rigor` (`/project-settings modes.rigor=minimal`).

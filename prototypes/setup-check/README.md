<!-- PROTOTYPE - NOT FOR PRODUCTION -->
# setup-check

- **Question**: are the A/B/C positions and out-of-play clusters read from the photo of the 12 setup cards right?
- **How to run**: published as a private Artifact (or opened locally); the owner corrects each card and marks it verified. Claude reads the `cards` collection (or the open page's state) and writes `data/content.json`.
- **Status**: concluded (2026-11-21)
- **Findings**: the owner verified all 12 cards on the published page; every position and out-of-play cluster read from the photo was correct (0 changes). Gate links are derived from the out-of-play runs. `data/content.json` holds the verified cards.

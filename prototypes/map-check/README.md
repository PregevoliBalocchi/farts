<!-- PROTOTYPE - NOT FOR PRODUCTION -->
# map-check

- **Question**: what resource does each planet produce, and are the building-slot counts read from the photo right?
- **How to run**: published as a private Artifact; the owner picks values, Claude reads them back from the artifact's `planets` collection and writes them into `data/content.json`.
- **Status**: concluded (2026-11-21)
- **Findings**: all 18 planet resources set by the owner (4 material, 4 fuel, 4 weapons, 3 relic, 3 psionic); every building-slot count read from the photo was confirmed unchanged. Values copied into `data/content.json`. The owner filled the local preview, not the published page, so nothing reached the artifact's store: for future data entry, say which copy to use.

---
trigger: always_on
---

# TourEase Production Quality & Visual Verification Gate

1. **Consumer-Grade Design Standard:**
   - Follow `.agents/skills/taste-skill/SKILL.md` and `.agents/skills/frontend-design/SKILL.md` on every UI change.
   - Maintain the bright Google Maps / Uber daytime palette (`#F4F6F9` canvas, `#FFFFFF` cards, `#1A73E8` primary blue, `1px solid #E2E8F0` borders). Never use dark-mode neon gradients, clipped headers, or unstyled lists.
   - Ensure mobile viewport (`390x844`) has zero horizontal overflow and `110px` bottom clearance above `.android-bottom-nav`.

2. **Mandatory Self-Verification Loop Before Finishing:**
   - Never claim a UI or feature change is complete based solely on reading code.
   - After editing `index1.html`, `app.js`, or `server.js`:
     1. Run `node -c server.js`, `node -c app/src/main/assets/app.js`, and `node check_ids.js`.
     2. Sync updated assets to `app/build/intermediates/assets/debug/mergeDebugAssets/`.
     3. Open `http://localhost:5500/index1.html` in the browser subagent (`390x844` mobile viewport), inspect console logs for zero errors, click through all affected flows, and inspect screenshots visually.
     4. Fix any visual flaw, broken image, overlap, or console error found and re-verify before reporting completion.

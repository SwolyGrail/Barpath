# Barpath

**Attack the Bar. Own the Path.**

Barpath is a premium, installable workout tracker that runs entirely in your browser — no account, no backend, no internet required after the first load. All your data lives on your device.

- 12 periodized programs (Powerbuilding, Hypertrophy, Powerlifting, Cardio/Endurance × 3/4/5 days)
- Automatic block/week periodization (Volume → Build → Peak → Deload)
- Workout logging with weights, reps, notes, exercise swaps and PR tracking
- XP, levels, badges, streaks, streak freezes, daily steps and weekly challenges
- Rest timer, confetti wins, print-friendly workouts
- Works offline and installs to your home screen (iOS Safari + Android Chrome)

## Run locally

It's plain static files. From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `barpath`).
2. Upload **all files in this folder to the repository root** — keep it flat (`index.html` must sit at the top level, with the `icons/` folder beside it). Don't nest everything inside a subfolder.
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Pick the **main** branch and the **/(root)** folder, then **Save**.
6. Wait ~1 minute. Your app will be live at `https://<your-username>.github.io/barpath/`.

Open that URL on your phone and use **Add to Home Screen** (iOS) or **Install app** (Android) to install it.

## Files

```
index.html          app shell
styles.css          design system
data.js             programs + content
app.js              all app logic
manifest.json       PWA manifest
service-worker.js   offline cache
logo.svg            logo
favicon-32.png      favicon
icons/              app icons (192/512 + maskable, apple-touch)
```

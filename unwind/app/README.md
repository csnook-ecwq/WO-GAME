# UNWIND phone apps (iPhone and Android)

This folder wraps the game (`../index.html`) into real iPhone and Android apps with
[Capacitor](https://capacitorjs.com). The game itself is unchanged: it runs offline inside the app, and
gets real haptics, a proper status bar, a splash screen and Android's back button.

You do **not** need a Mac. Builds run on GitHub's machines (and later Codemagic for signed iPhone builds).

## What's here
| Path | What it is |
|---|---|
| `capacitor.config.json` | App name **UNWIND**, app id `com.unwindgame.app` (change before publishing if you like; it can't change after release) |
| `android/`, `ios/` | The native projects Capacitor generated |
| `assets/` | App icon and splash sources (`source/*.svg`) and the PNGs made from them |
| `store/screenshots/` | Five 1290×2796 store screenshots (fit both App Store and Google Play) |
| `tools/` | Scripts that re-make the PNGs and the screenshots |

## Try it on an Android phone (free)
1. On GitHub open the repository's **Actions** tab, then the latest **UNWIND app builds** run.
2. Download **unwind-android-debug-apk** under *Artifacts*, unzip it, and open `app-debug.apk` on the phone
   (Android will ask you to allow installing from that source).

## Check the iPhone build
Actions tab → **UNWIND app builds** → **Run workflow**. That builds the iPhone app on a GitHub Mac to prove it
compiles. (Mac minutes cost 10× on private repositories, so it only runs when you ask.)

## Getting into the stores
1. **Google Play** — create a Google Play developer account ($25 once). A signed release bundle (`.aab`) needs an
   upload key; that step gets added to the workflow once the account exists.
2. **App Store** — create an Apple Developer account ($99/year). Without a Mac, use
   [Codemagic](https://codemagic.io) (free tier includes macOS build minutes): connect this repository, add an
   App Store Connect API key, and it signs the build and uploads it to TestFlight for you.
3. Both stores need a **privacy policy** URL and a store listing (name, description, screenshots from
   `store/screenshots/`, the 1024×1024 icon `assets/icon-only.png`).

## Rebuilding after game changes
```
npm ci            # once
npm run sync      # rebuilds ../index.html, copies it in, updates both native projects
npm run assets    # only after changing the icon or splash
```

# Checks

Five drivers that run the built app in a real browser. They are not unit tests
— there is nothing here to unit-test — they are the app being used, with
assertions about what should have happened. Most of the bugs in the iOS rebuild
were found by one of these rather than by reading.

Serve the app and run whichever you want:

```
python3 -m http.server 8765
npm i -D playwright axe-core
node tools/checks/drive.mjs shots/run
```

| | |
|---|---|
| `drive.mjs` | Taps every control on every screen and asserts the result |
| `shot.mjs` | Every tab at five sizes, with real safe-area insets forced in |
| `contrast.mjs` | Every text node against its actual background, at its own size and weight |
| `keyboard.mjs` | The whole app with no pointer at all |
| `a11y.mjs` | axe-core over every screen and modal, in both appearances |
| `edge.mjs` | 14 genres × 4 parts × 2 devices, 12-bar songs, 320px, a 100-character title |
| `classes.mjs` | Every class the CSS names against every class the app ever builds |
| `csscheck.mjs` | Rules the engine kept against blocks in the source — catches a stylesheet the parser is silently discarding |

Each prints its problems and exits 0; read the output. `PLAYWRIGHT` needs
Chromium — set `executablePath` at the top of each file if yours is elsewhere.

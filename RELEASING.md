# CI/CD and releases

## Workflows

| workflow                      | trigger                                                    | what it does                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml` (**CI**)             | PR or push to `main`/`develop`, manual                     | eslint, `tsc`; `npm run build`; `npm test` if a test script exists                                                              |
| `auto-tag.yml` (**Auto Tag**) | CI succeeded on a push to `main`                           | works out the next `vX.Y.Z` from Conventional Commits, pushes the tag, then runs Release. **Off until `AUTO_TAG_ENABLED=true`** |
| `release.yml` (**Release**)   | `vX.Y.Z` tag pushed, called by Auto Tag, manual with a tag | builds installers on native runners and publishes one GitHub Release with all of them and `SHA256SUMS.txt`                      |

### Release build matrix

| runner                         | platform | arch                   | outputs                                       |
| ------------------------------ | -------- | ---------------------- | --------------------------------------------- |
| `windows-latest`               | win      | x64                    | NSIS `.exe`, `latest.yml`, `.blockmap`        |
| `macos-latest` (Apple Silicon) | mac      | x64 + arm64 in one job | `.dmg`, `.zip` per arch, one `latest-mac.yml` |
| `ubuntu-latest`                | linux    | x64                    | `.AppImage`, `.deb`, `latest-linux.yml`       |

Both macOS architectures are built in one job on purpose. electron-updater
reads a single `latest-mac.yml`, and two separate jobs would each write one, so
the second upload would replace the first.

### How the release job works

1. The `version` in `package.json` is set from the tag (`npm version X.Y.Z
--no-git-tag-version`). Installer names and `latest*.yml` use that field, so
   they always match the tag. The version in git does not need bumping.
2. `npm run dist:<platform> -- <arch flags> --publish never`. The `dist:*`
   scripts run `npm run build` themselves. `--publish never` is required because
   `package.json` has a `github` publish target, and electron-builder would
   otherwise upload a draft release from every job.
3. A final job collects everything from `dist/` and creates the release.

Requirements on `package.json`: `dist:win`, `dist:mac` and `dist:linux` must end
in an `electron-builder` call so the extra arguments reach it, and
`build.directories.output` must stay `dist`.

## Cutting a release

**By hand**:

```sh
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
```

**Automatically**: set the repository variable `AUTO_TAG_ENABLED` to `true`.
From then on, every push to `main` whose CI passes is tagged if its commits
since the last tag include a `fix:`, `perf:`, `feat:` or breaking change. Auto
Tag calls Release directly, because tags pushed with `GITHUB_TOKEN` do not start
other workflows. Do not give Auto Tag a PAT: the tag push would then start
Release a second time.

To rebuild an existing tag: Actions → Release → Run workflow → enter the tag.

## Code signing: not set up yet

CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so builds are unsigned:

- **Windows**: SmartScreen warns on first run ("More info" → "Run anyway").
- **macOS**: Gatekeeper blocks the app. Users must run
  `xattr -dr com.apple.quarantine "/Applications/Harmony Revival.app"`.
  **Auto-update does not work on macOS for unsigned apps.**
- **Linux**: not affected.

To enable signing later, remove `CSC_IDENTITY_AUTO_DISCOVERY` and add these
secrets, passed as `env:` to the "Package Electron app" step:

| secret                                                     | platform | purpose                                                |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `CSC_LINK`                                                 | mac      | base64 `.p12` Developer ID Application certificate     |
| `CSC_KEY_PASSWORD`                                         | mac      | its password                                           |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | mac      | notarisation                                           |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | win      | Authenticode certificate, or use Azure Trusted Signing |

## `.releaserc.json` (semantic-release): not active

No workflow runs it. It is an alternative to Auto Tag, and running both would
create every tag twice. See `harmony-server/RELEASING.md` for how to switch.

## Secrets and variables

| name                  | kind     | required | purpose                                 |
| --------------------- | -------- | -------- | --------------------------------------- |
| `GITHUB_TOKEN`        | built in | yes      | tags and releases. Nothing to configure |
| `AUTO_TAG_ENABLED`    | variable | no       | `true` turns on automatic tagging       |
| signing secrets above | secret   | no       | only when code signing is added         |

## Node.js

CI uses the version in `.nvmrc` (24, the active LTS). Node 20 reached end of
life in April 2026.

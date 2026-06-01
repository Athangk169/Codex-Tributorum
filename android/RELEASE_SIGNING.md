# Release Signing — One-time Setup

The `build.gradle` is wired to look for credentials in
`android/app/keystore.properties` (gitignored). Without it, release
builds either fall back to the debug key (older flow) or fail to
sign (current flow with `signingConfig` block).

## 1. Generate a keystore (run once, ever)

From `android/app/`:

```bash
keytool -genkey -v \
  -keystore codex-release.keystore \
  -alias codex-release \
  -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Codex Tributorum, OU=Personal, O=Sanguinius, L=., ST=., C=IN"
```

- `-validity 36500` ≈ 100 years. A keystore you replace later can
  brick upgrade paths — sign once, sign forever.
- Pick a *strong* passphrase. Two reasonable places to keep it:
  a hardware password manager, or a printed copy in a safe.
- **The `.keystore` file is the single most precious artefact of
  this project.** Lose it and you can never ship an upgrade — users
  would have to uninstall + reinstall the app, wiping local data.

Back it up to:
- Encrypted USB
- Password-manager secure note (attach the file)
- Off-machine encrypted location (`age` to your own key, store in cloud)

## 2. Create keystore.properties

`android/app/keystore.properties` (gitignored — confirm with `git status`):

```properties
storeFile=codex-release.keystore
storePassword=<your strong passphrase>
keyAlias=codex-release
keyPassword=<same as storePassword unless you used -keypass>
```

## 3. Build a release APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

If the keystore is missing or misconfigured, gradle prints
`Could not get unknown property 'storeFile'` and stops — that's the
intended behaviour, not a bug.

## 4. Verify the APK is signed by your key

```bash
keytool -printcert -jarfile app-release.apk
```

The fingerprint should match the one in your keystore:

```bash
keytool -list -v -keystore codex-release.keystore -alias codex-release
```

## 5. CI / shell alternative

If you ever script the build, the gradle file also reads:

- `CODEX_KEYSTORE_FILE`         (path to `.keystore`)
- `CODEX_KEYSTORE_PASSWORD`
- `CODEX_KEYSTORE_ALIAS`
- `CODEX_KEYSTORE_ALIAS_PASSWORD` (defaults to `CODEX_KEYSTORE_PASSWORD`)

Either source is fine — the gradle picks `keystore.properties`
first, then falls back to env vars.

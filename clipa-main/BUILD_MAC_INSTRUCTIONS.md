# Building DMG for macOS Apple Silicon

## Prerequisites

1. **macOS system** (required for building native macOS apps)
2. **Python 3.8+** with pip
3. **Homebrew** (for installing create-dmg)

## Setup

1. **Install create-dmg:**
   ```bash
   brew install create-dmg
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

## Build Process

### Option A: Using the build script (Recommended)
```bash
python build_mac.py
```

### Option B: Manual build
1. **Build the app bundle:**
   ```bash
   python -m PyInstaller \
     main.py \
     --name=Clipa \
     --onefile \
     --windowed \
     --icon=app_icon.png \
     --add-data=NotoSansKhmer.ttf:. \
     --add-data=app_icon.png:. \
     --target-arch=arm64 \
     --clean \
     --noconfirm \
     --osx-bundle-identifier=com.clipa.app
   ```

2. **Create the DMG:**
   ```bash
   create-dmg \
     --volname "Clipa Installer" \
     --volicon app_icon.png \
     --window-pos 200 120 \
     --window-size 600 400 \
     --icon-size 100 \
     --icon "Clipa.app" 175 120 \
     --hide-extension "Clipa.app" \
     --app-drop-link 425 120 \
     "Clipa-macOS-AppleSilicon.dmg" \
     "dist/"
   ```

## Output

The build process will create:
- `dist/Clipa.app` - The macOS application bundle
- `Clipa-macOS-AppleSilicon.dmg` - The installer DMG

## Notes

- The `--target-arch=arm64` flag ensures the app is built for Apple Silicon
- The app will also run on Intel Macs through Rosetta 2
- For universal binaries (both Intel and ARM), use `--target-arch=universal2`

## Troubleshooting

1. **Permission issues:** Make sure the build script is executable:
   ```bash
   chmod +x build_mac.py
   ```

2. **Missing dependencies:** Ensure all Python packages are installed:
   ```bash
   pip install --upgrade -r requirements.txt
   ```

3. **create-dmg not found:** Install via Homebrew:
   ```bash
   brew install create-dmg
   ```
#!/usr/bin/env python3
"""
Create a complete Mac package that can be transferred and built
"""

import zipfile
import os

def create_mac_package():
    """Create a ZIP file with everything needed to build on Mac"""
    
    files_to_include = [
        'main.py',
        'clipboard_manager.py',
        'requirements.txt',
        'app_icon.png',
        'NotoSansKhmer.ttf',
        'build_simple_mac.py'
    ]
    
    # Create the ZIP file
    with zipfile.ZipFile('Clipa-Mac-Builder.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in files_to_include:
            if os.path.exists(file):
                zipf.write(file)
                print(f"✅ Added {file}")
            else:
                print(f"⚠️  Missing {file}")
        
        # Add instructions
        instructions = """# Clipa - Mac Build Instructions

## Quick Setup (5 minutes):

1. **Extract this ZIP** to any folder on your Mac
2. **Open Terminal** and navigate to the folder:
   ```bash
   cd /path/to/extracted/folder
   ```
3. **Run the build script**:
   ```bash
   python3 build_simple_mac.py
   ```
4. **Install the DMG** that gets created

## What This Does:
- Installs PyInstaller automatically
- Builds a native macOS app
- Creates a DMG installer
- Ready to install on any Mac (Intel or Apple Silicon)

## Requirements:
- macOS (any version with Python 3.6+)
- Internet connection (for PyInstaller download)

## Troubleshooting:
If you get permission errors, run:
```bash
chmod +x build_simple_mac.py
python3 build_simple_mac.py
```

That's it! The script handles everything else automatically.
"""
        
        zipf.writestr('README_MAC_BUILD.txt', instructions)
        print("✅ Added build instructions")
    
    print(f"\n🎉 Created: Clipa-Mac-Builder.zip")
    print(f"📁 Size: {os.path.getsize('Clipa-Mac-Builder.zip') / 1024:.1f} KB")
    print("\n📋 Next steps:")
    print("1. Transfer this ZIP file to your Mac")
    print("2. Extract it")
    print("3. Run: python3 build_simple_mac.py")
    print("4. Install the generated DMG")
    print("   (Or use GitHub Actions for automated builds)")

if __name__ == '__main__':
    create_mac_package()
#!/usr/bin/env python3
"""
Mac DMG Build Script for Clipa
Run this on a Mac system with Python 3.8+ and required dependencies
"""

import PyInstaller.__main__
import os
import subprocess
import shutil
import sys

def check_dependencies():
    """Check if required tools are installed"""
    try:
        subprocess.run(['create-dmg', '--version'], check=True, capture_output=True)
        print("✓ create-dmg is installed")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ create-dmg not found. Install with: brew install create-dmg")
        return False
    
    return True

def build_app():
    """Build the macOS app bundle"""
    print("Building macOS app bundle...")
    
    # Clean previous builds
    if os.path.exists('build'):
        shutil.rmtree('build')
    if os.path.exists('dist'):
        shutil.rmtree('dist')
    
    # PyInstaller arguments for macOS
    args = [
        'main.py',
        '--name=ClipboardManager',
        '--onefile',
        '--windowed',
        '--icon=app_icon.png',  # Use PNG for macOS
        '--add-data=NotoSansKhmer.ttf:.',
        '--add-data=app_icon.png:.',
        '--target-arch=arm64',  # Apple Silicon
        '--clean',
        '--noconfirm',
        '--osx-bundle-identifier=com.clipboardmanager.app',
    ]
    
    PyInstaller.__main__.run(args)
    print("✓ App bundle created")

def create_dmg():
    """Create DMG installer"""
    print("Creating DMG installer...")
    
    app_name = "Clipa"
    dmg_name = f"{app_name}-macOS-AppleSilicon.dmg"
    
    # Remove existing DMG
    if os.path.exists(dmg_name):
        os.remove(dmg_name)
    
    # Create DMG using create-dmg
    cmd = [
        'create-dmg',
        '--volname', f'{app_name} Installer',
        '--volicon', 'app_icon.png',
        '--window-pos', '200', '120',
        '--window-size', '600', '400',
        '--icon-size', '100',
        '--icon', f'{app_name}.app', '175', '120',
        '--hide-extension', f'{app_name}.app',
        '--app-drop-link', '425', '120',
        '--background', 'app_icon.png',  # You can create a custom background
        dmg_name,
        'dist/'
    ]
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"✓ DMG created: {dmg_name}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ DMG creation failed: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False

def main():
    print("🍎 Building Clipboard Manager for macOS Apple Silicon")
    print("=" * 50)
    
    # Check if running on macOS
    if sys.platform != 'darwin':
        print("❌ This script must be run on macOS")
        print("Transfer this script to a Mac system and run it there.")
        return
    
    # Check dependencies
    if not check_dependencies():
        return
    
    # Build the app
    build_app()
    
    # Create DMG
    if create_dmg():
        print("\n🎉 Build complete!")
        print(f"Your DMG is ready: Clipa-macOS-AppleSilicon.dmg")
    else:
        print("\n⚠️  App built but DMG creation failed")
        print("You can find the app in the dist/ folder")

if __name__ == '__main__':
    main()
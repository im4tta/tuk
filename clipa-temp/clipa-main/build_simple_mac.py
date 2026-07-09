#!/usr/bin/env python3
"""
Simple Mac DMG Builder - Run this on any Mac
No external dependencies needed except PyInstaller
"""

import os
import sys
import subprocess
import shutil

def run_command(cmd, description):
    """Run a command and handle errors"""
    print(f"\n🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"Error: {e.stderr}")
        return False

def main():
    print("🍎 Simple Mac DMG Builder for Clipa")
    print("=" * 50)
    
    # Check if running on macOS
    if sys.platform != 'darwin':
        print("❌ This script must be run on macOS")
        return False
    
    # Install PyInstaller if not available
    print("📦 Installing PyInstaller...")
    subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
    
    # Clean previous builds
    for folder in ['build', 'dist']:
        if os.path.exists(folder):
            shutil.rmtree(folder)
            print(f"🧹 Cleaned {folder}/")
    
    # Build the app
    cmd = f"""
    {sys.executable} -m PyInstaller \\
        main.py \\
        --name=Clipa \\
        --onefile \\
        --windowed \\
        --icon=app_icon.png \\
        --add-data=NotoSansKhmer.ttf:. \\
        --add-data=app_icon.png:. \\
        --clean \\
        --noconfirm \\
        --osx-bundle-identifier=com.clipboardmanager.app
    """
    
    if not run_command(cmd, "Building macOS app"):
        return False
    
    # Create a simple DMG using hdiutil (built into macOS)
    app_path = "dist/Clipa.app"
    dmg_name = "Clipa-macOS.dmg"
    
    if os.path.exists(app_path):
        # Create temporary folder for DMG contents
        temp_dmg_dir = "temp_dmg"
        if os.path.exists(temp_dmg_dir):
            shutil.rmtree(temp_dmg_dir)
        os.makedirs(temp_dmg_dir)
        
        # Copy app to temp directory
        shutil.copytree(app_path, f"{temp_dmg_dir}/Clipa.app")
        
        # Create Applications symlink
        os.symlink("/Applications", f"{temp_dmg_dir}/Applications")
        
        # Create DMG using hdiutil
        if os.path.exists(dmg_name):
            os.remove(dmg_name)
        
        cmd = f'hdiutil create -volname "Clipa" -srcfolder "{temp_dmg_dir}" -ov -format UDZO "{dmg_name}"'
        
        if run_command(cmd, "Creating DMG"):
            # Clean up
            shutil.rmtree(temp_dmg_dir)
            print(f"\n🎉 SUCCESS! Your DMG is ready: {dmg_name}")
            print(f"📁 File size: {os.path.getsize(dmg_name) / 1024 / 1024:.1f} MB")
            return True
        else:
            print("⚠️  DMG creation failed, but you have the .app file in dist/")
            return False
    else:
        print("❌ App bundle not found after build")
        return False

if __name__ == '__main__':
    success = main()
    if success:
        print("\n✨ You can now install Clipa-macOS.dmg on your Mac!")
    else:
        print("\n💡 If you have the .app file, you can drag it to Applications manually")
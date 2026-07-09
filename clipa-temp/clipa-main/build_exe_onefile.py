import PyInstaller.__main__
import os

# Build the executable (single portable file)
PyInstaller.__main__.run([
    'main.py',
    '--name=Clipa',
    '--onefile',
    '--windowed',
    '--icon=app_icon.ico',
    '--add-data=NotoSansKhmer.ttf;.',
    '--add-data=app_icon.ico;.',
    '--noupx',
    '--version-file=version_info.py',
    '--clean',
    '--noconfirm',
])

print("\n✓ Build complete! Check the 'dist' folder for Clipa.exe")

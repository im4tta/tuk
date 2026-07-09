import PyInstaller.__main__
import os

PyInstaller.__main__.run([
    'main.py',
    '--onefile',
    '--windowed',
    '--name=Tuk Desktop',
    '--icon=app_icon.ico',
    '--add-data=app_icon.ico;.',
    '--clean',
])

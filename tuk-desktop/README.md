# Tuk Desktop

A desktop application combining clipboard management and screenshot capture. Built with PyQt6.

## Features

- **Screen Capture**: Capture screenshots at 1×, 2×, or 4× resolution
- **Clipboard Monitoring**: Automatically detects when you take screenshots
- **Clipboard History**: Track all text and images copied to clipboard
- **Pinned Items**: Pin frequently used clipboard items for quick access
- **Local Storage**: All data stays on your machine

## Installation

1. Install Python 3.8 or higher
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Running the App

```
python main.py
```

## Building EXE

```
pyinstaller --onefile --windowed --name "Tuk Desktop" --icon=app_icon.ico main.py
```

The executable will be in the `dist` folder.

## Requirements

- PyQt6 >= 6.6.0
- pyperclip >= 1.8.2
- Pillow >= 10.0.0
- mss >= 9.0.0
- pyinstaller >= 6.3.0 (for building)

## How It Works

### Clipboard Monitoring
The app monitors your clipboard every 300ms for changes. When you take a screenshot (Print Screen, Win+Shift+S, etc.) or copy an image, it automatically captures it.

### Screen Capture
Click "Capture Screen" to use the built-in screen capture feature. Select resolution multiplier (1×, 2×, 4×) for high-resolution exports.

### Auto-Detection
The app auto-detects content types:
- URLs, Emails, IP Addresses
- JSON, Code, File Paths
- Dates, Phone Numbers
- Images (PNG, JPEG, etc.)

## Tips

1. **Take Screenshots**: Use `Print Screen`, `Win+Shift+S` (Windows), or `Cmd+Shift+4` (Mac)
2. **Auto-Detection**: The app will automatically capture the screenshot
3. **Pin Items**: Click 📌 to pin frequently used items
4. **Search**: Use the search box to filter history

## License

MIT

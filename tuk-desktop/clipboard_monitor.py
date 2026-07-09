import re
import pyperclip
from PyQt6.QtCore import QThread, pyqtSignal, QByteArray
from PyQt6.QtGui import QImage
from datetime import datetime
from PIL import Image
import io


class ClipboardMonitor(QThread):
    """Monitors clipboard for both text and image changes."""
    clipboard_text_changed = pyqtSignal(str)
    clipboard_image_changed = pyqtSignal(object)  # PIL Image or bytes
    
    def __init__(self):
        super().__init__()
        self.running = True
        self.last_text = ""
        self.last_image_hash = None
    
    def run(self):
        while self.running:
            try:
                # Check for image first
                img = self._get_clipboard_image()
                if img is not None:
                    img_hash = self._image_hash(img)
                    if img_hash != self.last_image_hash:
                        self.last_image_hash = img_hash
                        self.clipboard_image_changed.emit(img)
                
                # Check for text
                current_text = pyperclip.paste()
                if current_text != self.last_text and current_text.strip():
                    self.last_text = current_text
                    self.clipboard_text_changed.emit(current_text)
                    
            except Exception as e:
                print(f"Error monitoring clipboard: {e}")
            self.msleep(300)  # Check every 300ms
    
    def _get_clipboard_image(self):
        """Try to get image from clipboard using PIL."""
        try:
            from PIL import ImageGrab
            img = ImageGrab.grabclipboard()
            if img is not None and isinstance(img, Image.Image):
                return img
        except Exception:
            pass
        return None
    
    def _image_hash(self, img):
        """Generate a simple hash for image comparison."""
        if img is None:
            return None
        # Use image size and a sample of pixels for quick comparison
        return (img.size, img.tobytes()[:100] if img.tobytes() else b'')
    
    def stop(self):
        self.running = False


def detect_type(text):
    """Auto-detect the content type of clipboard text."""
    text = text.strip()
    if not text:
        return "Empty"

    # URL
    if re.match(r'^https?://', text, re.IGNORECASE) or re.match(r'^[a-z]+://', text, re.IGNORECASE):
        return "URL"
    if re.match(r'^www\.', text, re.IGNORECASE):
        return "URL"

    # Email
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', text):
        return "Email"

    # IP Address
    if re.match(r'^(\d{1,3}\.){3}\d{1,3}$', text):
        return "IP Address"

    # Hex Color
    if re.match(r'^#([0-9a-fA-F]{3}){1,2}$', text):
        return "Color"

    # JSON
    if (text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']')):
        try:
            import json
            json.loads(text)
            return "JSON"
        except Exception:
            pass

    # File Path
    if re.match(r'^[a-zA-Z]:[/\\]|^[/\\]|^[~.][/\\]', text):
        return "Path"

    # Date
    if re.match(r'^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$', text):
        return "Date"

    # Phone
    if re.match(r'^[\+]?[\d\s\-\(\)\.]{7,20}$', text):
        return "Phone"

    # Number
    if re.match(r'^[\+\-]?\d+(\.\d+)?$', text):
        return "Number"

    # Code detection
    code_indicators = [
        r'^(def |class |import |from |function\s|const |let |var |#include |using namespace |package |public class |<?php|#!/usr/bin)',
        r'[{;}]\s*$',
        r'^(if|for|while|switch|try|catch|else|elif|endif|endfor)\s*[\(:\{]',
        r'(==|!=|<=|>=|=>|->|\|\||&&|\+\+|--)',
    ]
    lines = text.split('\n')
    code_score = 0
    for line in lines:
        for pattern in code_indicators:
            if re.search(pattern, line, re.IGNORECASE):
                code_score += 1
                break
    if code_score >= 2 or (len(lines) > 1 and code_score >= 1):
        return "Code"

    # Multi-line
    if '\n' in text:
        return "Multi-line"

    return "Text"


class ClipboardItem:
    def __init__(self, content, content_type=None):
        self.content = content
        self.timestamp = datetime.now()
        self.pinned = False
        self.is_image = isinstance(content, (bytes, Image.Image))
        self.content_type = content_type or ("Image" if self.is_image else detect_type(content))
        self.size_bytes = len(content) if isinstance(content, bytes) else 0
    
    def __str__(self):
        if self.is_image:
            return f"Image ({self.size_bytes} bytes)"
        preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return preview.replace('\n', ' ')

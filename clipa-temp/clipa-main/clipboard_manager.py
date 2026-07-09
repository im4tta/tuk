import re
import pyperclip
from PyQt6.QtCore import QThread, pyqtSignal
from datetime import datetime


class ClipboardMonitor(QThread):
    clipboard_changed = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self.running = True
        self.last_value = ""

    def run(self):
        while self.running:
            try:
                current = pyperclip.paste()
                if current != self.last_value and current.strip():
                    self.last_value = current
                    self.clipboard_changed.emit(current)
            except Exception as e:
                print(f"Error monitoring clipboard: {e}")
            self.msleep(500)

    def stop(self):
        self.running = False


def detect_type(text):
    """Auto-detect the content type of clipboard text."""
    text = text.strip()
    if not text:
        return "Empty"

    # URL (must check before IP since URLs may contain IPs)
    if re.match(r'^https?://', text, re.IGNORECASE) or re.match(r'^[a-z]+://', text, re.IGNORECASE):
        return "URL"
    if re.match(r'^www\.', text, re.IGNORECASE):
        return "URL"

    # Email
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', text):
        return "Email"

    # IP Address (v4 and v6)
    if re.match(r'^(\d{1,3}\.){3}\d{1,3}$', text):
        return "IP Address"
    if re.match(r'^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$', text):
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

    # File Path (Windows / Unix)
    if re.match(r'^[a-zA-Z]:[/\\]|^[/\\]|^[~.][/\\]', text):
        return "Path"
    if re.match(r'^[a-zA-Z]:\\\\|^\\\\|^/', text):
        return "Path"

    # Date (various formats)
    if re.match(r'^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$', text):
        return "Date"
    if re.match(r'^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$', text):
        return "Date"

    # Phone Number
    if re.match(r'^[\+]?[\d\s\-\(\)\.]{7,20}$', text):
        return "Phone"

    # Number (integer or float)
    if re.match(r'^[\+\-]?\d+(\.\d+)?$', text):
        return "Number"

    # Code detection: common programming patterns
    code_indicators = [
        r'^(def |class |import |from |function\s|const |let |var |#include |using namespace |package |public class |<?php|#!/usr/bin)',
        r'[{;}]\s*$',                          # lines ending with braces/semicolons
        r'^(if|for|while|switch|try|catch|else|elif|endif|endfor)\s*[\(:\{]',
        r'(==|!=|<=|>=|=>|->|\|\||&&|\+\+|--)',  # operators
        r'^(\s{2,4})+(\w+)',                  # indentation
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

    # Multi-line text
    if '\n' in text:
        return "Multi-line"

    return "Text"


class ClipboardItem:
    def __init__(self, content):
        self.content = content
        self.timestamp = datetime.now()
        self.pinned = False
        self.content_type = detect_type(content)

    def __str__(self):
        preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return preview.replace('\n', ' ')

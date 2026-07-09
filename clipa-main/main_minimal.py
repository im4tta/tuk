#!/usr/bin/env python3
"""
Minimal version of Clipboard Manager for testing builds
"""

import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QLabel, QVBoxLayout, QWidget
from PyQt6.QtCore import Qt


class MinimalClipboardApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Clipboard Manager - Test Build")
        self.setGeometry(100, 100, 400, 300)
        
        # Create central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Create layout
        layout = QVBoxLayout(central_widget)
        
        # Add a simple label
        label = QLabel("Clipboard Manager\nTest Build Successful!")
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(label)


def main():
    app = QApplication(sys.argv)
    window = MinimalClipboardApp()
    window.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
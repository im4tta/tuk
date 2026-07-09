import io
import os
from datetime import datetime
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QPoint
from PyQt6.QtGui import QPixmap, QImage, QColor, QPainter, QPen, QFont, QGuiApplication
from PyQt6.QtWidgets import QWidget, QApplication, QLabel, QVBoxLayout, QHBoxLayout, QPushButton


class ScreenshotCapture(QWidget):
    """Fullscreen screenshot capture overlay with selection support."""
    screenshot_captured = pyqtSignal(object)  # Emits QPixmap
    
    def __init__(self):
        super().__init__()
        self.begin = QPoint()
        self.end = QPoint()
        self.capturing = False
        self.pixmap = None
        
        # Setup window for fullscreen overlay
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowState(Qt.WindowState.WindowFullScreen)
        self.setCursor(Qt.CursorShape.CrossCursor)
        
        # Instructions label
        self.instruction_label = QLabel(self)
        self.instruction_label.setText("Click and drag to select area • Press ESC to cancel")
        self.instruction_label.setStyleSheet("""
            QLabel {
                background-color: rgba(30, 30, 46, 0.9);
                color: #cdd6f4;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: bold;
            }
        """)
        self.instruction_label.adjustSize()
        
    def start_capture(self):
        """Start the screenshot capture process."""
        # Capture the entire screen
        screen = QGuiApplication.primaryScreen()
        if screen:
            self.pixmap = screen.grabWindow(0)
        self.show()
        self.activateWindow()
        
    def paintEvent(self, event):
        """Draw the overlay and selection rectangle."""
        if not self.pixmap:
            return
            
        painter = QPainter(self)
        painter.drawPixmap(0, 0, self.pixmap)
        
        # Darken the entire screen
        painter.fillRect(self.rect(), QColor(0, 0, 0, 120))
        
        if self.capturing:
            # Draw selection rectangle
            selection = self.get_selection()
            if selection.width() > 0 and selection.height() > 0:
                # Clear the selection area (show original)
                painter.drawPixmap(selection, self.pixmap, selection)
                
                # Draw selection border
                pen = QPen(QColor("#89b4fa"), 2)
                painter.setPen(pen)
                painter.drawRect(selection)
                
                # Draw size indicator
                size_text = f"{selection.width()} × {selection.height()}"
                font = QFont()
                font.setPointSize(12)
                font.setBold(True)
                painter.setFont(font)
                painter.setPen(QColor("#89b4fa"))
                
                # Position text above selection
                text_pos = QPoint(selection.left(), selection.top() - 10)
                if text_pos.y() < 20:
                    text_pos.setY(selection.bottom() + 25)
                painter.drawText(text_pos, size_text)
        
        # Position instruction label
        self.instruction_label.move(
            (self.width() - self.instruction_label.width()) // 2,
            20
        )
        
    def get_selection(self):
        """Get the normalized selection rectangle."""
        return QRect(self.begin, self.end).normalized()
        
    def mousePressEvent(self, event):
        """Start selection on mouse press."""
        if event.button() == Qt.MouseButton.LeftButton:
            self.begin = event.pos()
            self.end = event.pos()
            self.capturing = True
            
    def mouseMoveEvent(self, event):
        """Update selection on mouse move."""
        if self.capturing:
            self.end = event.pos()
            self.update()
            
    def mouseReleaseEvent(self, event):
        """Complete selection on mouse release."""
        if event.button() == Qt.MouseButton.LeftButton and self.capturing:
            self.capturing = False
            selection = self.get_selection()
            
            if selection.width() > 5 and selection.height() > 5:
                # Extract the selected region
                captured = self.pixmap.copy(selection)
                self.screenshot_captured.emit(captured)
            
            self.close()
            self.pixmap = None
            
    def keyPressEvent(self, event):
        """Cancel capture on ESC key."""
        if event.key() == Qt.Key.Key_Escape:
            self.capturing = False
            self.close()
            self.pixmap = None


class ImagePreviewCard(QWidget):
    """Card widget for displaying captured screenshots."""
    copy_requested = pyqtSignal(object)  # Emits QPixmap
    save_requested = pyqtSignal(object)  # Emits QPixmap
    delete_requested = pyqtSignal()
    
    def __init__(self, pixmap, timestamp=None):
        super().__init__()
        self.pixmap = pixmap
        self.timestamp = timestamp or datetime.now()
        
        self.setObjectName("card")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setMaximumHeight(140)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(12)
        
        # Thumbnail
        thumb_label = QLabel()
        thumb_label.setFixedSize(120, 90)
        thumb_label.setScaledContents(True)
        thumb_label.setPixmap(pixmap.scaled(120, 90, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation))
        thumb_label.setStyleSheet("border-radius: 6px;")
        layout.addWidget(thumb_label)
        
        # Info
        info_layout = QVBoxLayout()
        info_layout.setSpacing(4)
        
        size_label = QLabel(f"📷 {pixmap.width()} × {pixmap.height()}")
        size_label.setStyleSheet("color: #cdd6f4; font-weight: bold; background: transparent;")
        info_layout.addWidget(size_label)
        
        time_label = QLabel(self.timestamp.strftime("%H:%M:%S"))
        time_label.setStyleSheet("color: #a6adc8; font-size: 10pt; background: transparent;")
        info_layout.addWidget(time_label)
        
        info_layout.addStretch()
        layout.addLayout(info_layout, 1)
        
        # Actions
        btn_layout = QVBoxLayout()
        btn_layout.setSpacing(6)
        
        copy_btn = QPushButton("📋 Copy")
        copy_btn.setObjectName("ghostBtn")
        copy_btn.clicked.connect(lambda: self.copy_requested.emit(self.pixmap))
        btn_layout.addWidget(copy_btn)
        
        save_btn = QPushButton("💾 Save")
        save_btn.setObjectName("primaryBtn")
        save_btn.clicked.connect(lambda: self.save_requested.emit(self.pixmap))
        btn_layout.addWidget(save_btn)
        
        layout.addLayout(btn_layout)
        
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.copy_requested.emit(self.pixmap)


# Need to import QRect for the get_selection method
from PyQt6.QtCore import QRect

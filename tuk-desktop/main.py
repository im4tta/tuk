import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QScrollArea, QFrame, QStackedWidget,
    QLineEdit, QComboBox, QCheckBox, QMessageBox, QFileDialog,
    QGraphicsDropShadowEffect, QSizePolicy, QSpinBox
)
from PyQt6.QtCore import Qt, QTimer, QSettings, QSize, pyqtSignal
from PyQt6.QtGui import QFont, QIcon, QPixmap, QImage, QColor
from datetime import datetime
from PIL import Image
import io

from clipboard_monitor import ClipboardMonitor, ClipboardItem, detect_type
from screen_capture import ScreenCapture, capture_screen, image_to_bytes, bytes_to_image


# ============================================================
# DESIGN SYSTEM
# ============================================================
C = {
    'base': '#1e1e2e',
    'mantle': '#181825',
    'crust': '#11111b',
    'surface0': '#313244',
    'surface1': '#45475a',
    'surface2': '#585b70',
    'overlay0': '#6c7086',
    'overlay1': '#7f849c',
    'text': '#cdd6f4',
    'subtext1': '#bac2de',
    'subtext0': '#a6adc8',
    'blue': '#3652E0',
    'blue_hover': '#2A40B8',
    'lavender': '#b4befe',
    'green': '#a6e3a1',
    'red': '#E0473A',
    'maroon': '#eba0ac',
    'yellow': '#f9e2af',
    'mauve': '#cba6f7',
    'peach': '#fab387',
    'amber': '#F5A524',
}


def build_stylesheet():
    return f"""
    QMainWindow {{ background-color: {C['crust']}; }}
    QWidget {{ background-color: {C['crust']}; color: {C['text']}; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; }}

    QPushButton {{
        background-color: {C['surface0']}; border: none; border-radius: 8px;
        padding: 8px 16px; color: {C['text']}; font-weight: 500;
    }}
    QPushButton:hover {{ background-color: {C['surface1']}; }}
    QPushButton:pressed {{ background-color: {C['surface2']}; }}

    QPushButton#primaryBtn {{ background-color: {C['blue']}; color: #fff; font-weight: bold; }}
    QPushButton#primaryBtn:hover {{ background-color: {C['blue_hover']}; }}

    QPushButton#dangerBtn {{ background-color: {C['red']}; color: #fff; font-weight: bold; }}
    QPushButton#dangerBtn:hover {{ background-color: {C['maroon']}; }}

    QPushButton#ghostBtn {{ background-color: transparent; color: {C['subtext0']}; }}
    QPushButton#ghostBtn:hover {{ background-color: {C['surface0']}; color: {C['text']}; }}

    QPushButton#iconBtn {{
        background-color: transparent; border-radius: 8px; padding: 6px;
        color: {C['subtext0']}; font-size: 16px; min-width: 36px; min-height: 36px;
    }}
    QPushButton#iconBtn:hover {{ background-color: {C['surface0']}; color: {C['text']}; }}

    QPushButton#navBtn {{
        background-color: transparent; border-radius: 10px; padding: 10px 16px;
        text-align: left; color: {C['subtext0']}; font-size: 11pt;
    }}
    QPushButton#navBtn:hover {{ background-color: {C['surface0']}; color: {C['text']}; }}

    QPushButton#navBtnActive {{
        background-color: {C['surface0']}; border-radius: 10px; padding: 10px 16px;
        text-align: left; color: {C['blue']}; font-weight: bold; font-size: 11pt;
    }}
    QPushButton#navBtnActive:hover {{ background-color: {C['surface1']}; }}

    QLineEdit, QSpinBox {{
        background-color: {C['mantle']}; border: 1px solid {C['surface0']};
        border-radius: 8px; padding: 8px 12px; color: {C['text']};
    }}
    QLineEdit:focus, QSpinBox:focus {{ border: 1px solid {C['blue']}; }}

    QComboBox {{
        background-color: {C['surface0']}; border: none; border-radius: 8px; padding: 8px 12px;
    }}
    QComboBox::drop-down {{ border: none; width: 24px; }}
    QComboBox::down-arrow {{
        image: none; border-left: 4px solid transparent;
        border-right: 4px solid transparent; border-top: 5px solid {C['text']};
    }}
    QComboBox QAbstractItemView {{
        background-color: {C['surface0']}; border: 1px solid {C['surface1']};
        border-radius: 8px; selection-background-color: {C['surface1']};
    }}

    QCheckBox {{ spacing: 10px; }}
    QCheckBox::indicator {{
        width: 20px; height: 20px; border-radius: 6px;
        border: 2px solid {C['surface1']}; background-color: {C['mantle']};
    }}
    QCheckBox::indicator:checked {{ background-color: {C['blue']}; border-color: {C['blue']}; }}

    QScrollArea {{ border: none; background-color: transparent; }}
    QScrollBar:vertical {{
        background-color: transparent; width: 8px; border-radius: 4px;
    }}
    QScrollBar::handle:vertical {{
        background-color: {C['surface0']}; border-radius: 4px; min-height: 30px;
    }}
    QScrollBar::handle:vertical:hover {{ background-color: {C['surface1']}; }}
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0px; }}

    QLabel#logoText {{ font-size: 20pt; font-weight: bold; color: {C['blue']}; background: transparent; }}
    QLabel#sectionTitle {{ font-size: 18pt; font-weight: bold; color: {C['text']}; background: transparent; }}
    QLabel#cardTitle {{ font-size: 11pt; font-weight: bold; color: {C['text']}; background: transparent; }}
    QLabel#cardMeta {{ font-size: 9pt; color: {C['overlay1']}; background: transparent; }}

    QFrame#card {{
        background-color: {C['mantle']}; border-radius: 12px;
        border: 1px solid {C['surface0']};
    }}
    QFrame#card:hover {{ border: 1px solid {C['surface1']}; }}

    QFrame#sidebar {{
        background-color: {C['base']}; border-right: 1px solid {C['surface0']};
    }}
    """


# ============================================================
# TOAST NOTIFICATION
# ============================================================
class Toast(QWidget):
    def __init__(self, parent, duration=2000):
        super().__init__(parent)
        self.duration = duration
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.hide)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        self.frame = QFrame(self)
        self.frame.setObjectName("card")
        self.frame.setStyleSheet(f"""
            QFrame#card {{
                background-color: {C['surface0']};
                border-radius: 10px;
                border: 1px solid {C['surface1']};
            }}
        """)

        layout = QHBoxLayout(self.frame)
        layout.setContentsMargins(16, 10, 16, 10)
        self.label = QLabel("")
        self.label.setStyleSheet(f"color: {C['text']}; font-size: 10pt; background: transparent;")
        layout.addWidget(self.label)

        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(24)
        shadow.setXOffset(0)
        shadow.setYOffset(6)
        shadow.setColor(QColor(0, 0, 0, 100))
        self.frame.setGraphicsEffect(shadow)

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(self.frame)

        self.setFixedWidth(320)
        self.hide()

    def show_message(self, text):
        self.label.setText(text)
        self.adjustSize()
        parent_rect = self.parent().rect()
        x = (parent_rect.width() - self.width()) // 2
        y = parent_rect.height() - self.height() - 24
        self.move(x, y)
        self.show()
        self.raise_()
        self.timer.start(self.duration)


# ============================================================
# CLIPBOARD CARD
# ============================================================
class ClipCard(QFrame):
    copy_signal = pyqtSignal(object)
    pin_signal = pyqtSignal(object)
    delete_signal = pyqtSignal(object)

    def __init__(self, item, is_pinned=False):
        super().__init__()
        self.setObjectName("card")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.item = item
        self.is_pinned = is_pinned
        self.is_image = item.is_image if hasattr(item, 'is_image') else False
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setFixedHeight(100 if self.is_image else 80)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(6)

        # Preview row
        top = QHBoxLayout()
        
        if self.is_image:
            # Show image thumbnail
            self.preview = QLabel("📷 Image")
            self.preview.setObjectName("cardTitle")
        else:
            preview = item.content[:70] + "..." if len(item.content) > 70 else item.content
            self.preview = QLabel(preview.replace("\n", " "))
            self.preview.setObjectName("cardTitle")
            self.preview.setWordWrap(True)
        
        top.addWidget(self.preview, 1)

        # Action buttons
        acts = QHBoxLayout()
        acts.setSpacing(4)

        pin_btn = QPushButton("📌" if not is_pinned else "📍")
        pin_btn.setObjectName("iconBtn")
        pin_btn.setToolTip("Pin" if not is_pinned else "Unpin")
        pin_btn.clicked.connect(self.on_pin)
        acts.addWidget(pin_btn)

        copy_btn = QPushButton("📋")
        copy_btn.setObjectName("iconBtn")
        copy_btn.setToolTip("Copy")
        copy_btn.clicked.connect(self.on_copy)
        acts.addWidget(copy_btn)

        del_btn = QPushButton("🗑")
        del_btn.setObjectName("iconBtn")
        del_btn.setToolTip("Delete")
        del_btn.clicked.connect(self.on_delete)
        acts.addWidget(del_btn)

        top.addLayout(acts)
        layout.addLayout(top)

        # Meta row
        meta = QHBoxLayout()
        meta.setSpacing(8)

        type_lbl = QLabel(item.content_type)
        type_lbl.setStyleSheet(self._badge_style(item.content_type))
        meta.addWidget(type_lbl)

        if hasattr(item, 'timestamp'):
            time_lbl = QLabel(item.timestamp.strftime("%H:%M"))
            time_lbl.setObjectName("cardMeta")
            meta.addWidget(time_lbl)

        meta.addStretch()
        layout.addLayout(meta)

    def on_copy(self):
        self.copy_signal.emit(self.item)

    def on_pin(self):
        self.pin_signal.emit(self.item)

    def on_delete(self):
        self.delete_signal.emit(self.item)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.on_copy()

    def _badge_style(self, t):
        colors = {
            "Image": ("#2a3a3a", C['green']),
            "URL": ("#1e3a5f", "#89b4fa"), "Email": ("#3d2f4f", "#cba6f7"),
            "IP Address": ("#2a3a2a", "#a6e3a1"), "Color": ("#3a2a3a", "#f38ba8"),
            "JSON": ("#2a3a3a", "#94e2d5"), "Path": ("#3a3a2a", "#f9e2af"),
            "Date": ("#3a2a2a", "#fab387"), "Phone": ("#2a2a3a", "#b4befe"),
            "Number": ("#2a3a2a", "#a6e3a1"), "Code": ("#2a2a3a", "#b4befe"),
            "Multi-line": ("#3a3a3a", "#a6adc8"), "Text": ("#313244", "#89b4fa"),
        }
        bg, fg = colors.get(t, ("#313244", "#89b4fa"))
        return f"background-color: {bg}; color: {fg}; border-radius: 6px; padding: 2px 8px; font-size: 8pt; font-weight: bold;"


# ============================================================
# MAIN APPLICATION
# ============================================================
class TukDesktopApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.history = []
        self.pinned = []
        self.settings = QSettings("TukDesktop", "Settings")
        
        # Clipboard monitor
        self.monitor = ClipboardMonitor()
        self.monitor.clipboard_text_changed.connect(self.on_clipboard_text_change)
        self.monitor.clipboard_image_changed.connect(self.on_clipboard_image_change)
        
        self.init_ui()
        self.apply_saved_settings()
        self.monitor.start()

    def init_ui(self):
        self.setWindowTitle("Tuk Desktop — Paste, Capture, Keep")
        self.setGeometry(120, 100, 1200, 800)
        self.setMinimumSize(900, 600)

        # Set icon
        base = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        ico = os.path.join(base, "app_icon.ico")
        if os.path.exists(ico):
            self.setWindowIcon(QIcon(ico))

        self.setStyleSheet(build_stylesheet())

        # Main layout
        central = QWidget()
        self.setCentralWidget(central)
        main = QHBoxLayout(central)
        main.setContentsMargins(0, 0, 0, 0)
        main.setSpacing(0)

        # ---- SIDEBAR ----
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(220)
        sb = QVBoxLayout(sidebar)
        sb.setContentsMargins(14, 20, 14, 16)
        sb.setSpacing(8)

        logo = QLabel("📷 Tuk Desktop")
        logo.setObjectName("logoText")
        sb.addWidget(logo)

        sub = QLabel("Paste, Capture, Keep")
        sub.setStyleSheet(f"color: {C['overlay1']}; font-size: 9pt; background: transparent;")
        sb.addWidget(sub)
        sb.addSpacing(24)

        self.nav_btns = {}
        for key, label in [("captures", "📷 Captures"), ("history", "📋 History"),
                           ("pinned", "📌 Pinned"), ("settings", "⚙️ Settings")]:
            btn = QPushButton(label)
            btn.setObjectName("navBtn")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _, k=key: self.switch_view(k))
            self.nav_btns[key] = btn
            sb.addWidget(btn)

        sb.addStretch()

        # Capture button at bottom of sidebar
        capture_btn = QPushButton("📸 Capture Screen")
        capture_btn.setObjectName("primaryBtn")
        capture_btn.clicked.connect(self.capture_screen)
        sb.addWidget(capture_btn)

        main.addWidget(sidebar)

        # ---- CONTENT ----
        self.stack = QStackedWidget()
        self.stack.addWidget(self._captures_page())
        self.stack.addWidget(self._history_page())
        self.stack.addWidget(self._pinned_page())
        self.stack.addWidget(self._settings_page())
        main.addWidget(self.stack, 1)

        self.toast = Toast(self)
        self.switch_view("captures")

    def _captures_page(self):
        """Main page showing screenshot captures."""
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(18)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("📷 Captures")
        title.setObjectName("sectionTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        # Scale selector
        hdr.addWidget(QLabel("Resolution:"))
        self.scale_combo = QComboBox()
        self.scale_combo.addItems(["1×", "2×", "4×"])
        self.scale_combo.setCurrentIndex(2)  # Default 4×
        self.scale_combo.setFixedWidth(80)
        hdr.addWidget(self.scale_combo)

        # Capture button
        capture_btn = QPushButton("📸 Capture Screen")
        capture_btn.setObjectName("primaryBtn")
        capture_btn.clicked.connect(self.capture_screen)
        hdr.addWidget(capture_btn)

        v.addLayout(hdr)

        # Stats
        self.capture_stat = QLabel("0 captures")
        self.capture_stat.setObjectName("cardMeta")
        v.addWidget(self.capture_stat)

        # Scroll area for captures
        scr = QScrollArea()
        scr.setWidgetResizable(True)
        scr.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.capture_container = QWidget()
        self.capture_layout = QVBoxLayout(self.capture_container)
        self.capture_layout.setContentsMargins(0, 0, 8, 0)
        self.capture_layout.setSpacing(8)
        self.capture_layout.addStretch()
        scr.setWidget(self.capture_container)
        v.addWidget(scr, 1)

        return page

    def _history_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(18)

        hdr = QHBoxLayout()
        title = QLabel("📋 History")
        title.setObjectName("sectionTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        self.hist_type_filter = QComboBox()
        self.hist_type_filter.addItem("All Types")
        self.hist_type_filter.setFixedWidth(150)
        self.hist_type_filter.currentTextChanged.connect(self.refresh_history)
        hdr.addWidget(self.hist_type_filter)

        self.hist_search = QLineEdit()
        self.hist_search.setPlaceholderText("🔍 Search history...")
        self.hist_search.setFixedWidth(250)
        self.hist_search.textChanged.connect(self.refresh_history)
        hdr.addWidget(self.hist_search)
        v.addLayout(hdr)

        self.hist_stat = QLabel("0 items")
        self.hist_stat.setObjectName("cardMeta")
        v.addWidget(self.hist_stat)

        scr = QScrollArea()
        scr.setWidgetResizable(True)
        scr.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.hist_container = QWidget()
        self.hist_layout = QVBoxLayout(self.hist_container)
        self.hist_layout.setContentsMargins(0, 0, 8, 0)
        self.hist_layout.setSpacing(8)
        self.hist_layout.addStretch()
        scr.setWidget(self.hist_container)
        v.addWidget(scr, 1)
        return page

    def _pinned_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(18)

        hdr = QHBoxLayout()
        title = QLabel("📌 Pinned")
        title.setObjectName("sectionTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        self.pin_type_filter = QComboBox()
        self.pin_type_filter.addItem("All Types")
        self.pin_type_filter.setFixedWidth(150)
        self.pin_type_filter.currentTextChanged.connect(self.refresh_pinned)
        hdr.addWidget(self.pin_type_filter)

        self.pin_search = QLineEdit()
        self.pin_search.setPlaceholderText("🔍 Search pinned...")
        self.pin_search.setFixedWidth(250)
        self.pin_search.textChanged.connect(self.refresh_pinned)
        hdr.addWidget(self.pin_search)
        v.addLayout(hdr)

        self.pin_stat = QLabel("0 items")
        self.pin_stat.setObjectName("cardMeta")
        v.addWidget(self.pin_stat)

        scr = QScrollArea()
        scr.setWidgetResizable(True)
        scr.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.pin_container = QWidget()
        self.pin_layout = QVBoxLayout(self.pin_container)
        self.pin_layout.setContentsMargins(0, 0, 8, 0)
        self.pin_layout.setSpacing(8)
        self.pin_layout.addStretch()
        scr.setWidget(self.pin_container)
        v.addWidget(scr, 1)
        return page

    def _settings_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(20)

        title = QLabel("⚙️ Settings")
        title.setObjectName("sectionTitle")
        v.addWidget(title)

        v.addWidget(self._section_label("Capture"))

        row1 = QHBoxLayout()
        self.set_auto_capture = QCheckBox("Auto-add screen captures to history")
        row1.addWidget(self.set_auto_capture)
        row1.addStretch()
        v.addLayout(row1)

        v.addWidget(self._section_label("Clipboard"))

        row2 = QHBoxLayout()
        self.set_monitor_clipboard = QCheckBox("Monitor clipboard for images")
        self.set_monitor_clipboard.setChecked(True)
        row2.addWidget(self.set_monitor_clipboard)
        row2.addStretch()
        v.addLayout(row2)

        v.addWidget(self._section_label("History"))

        row3 = QHBoxLayout()
        row3.addWidget(QLabel("History limit:"))
        self.limit_spin = QSpinBox()
        self.limit_spin.setRange(10, 1000)
        self.limit_spin.setValue(100)
        self.limit_spin.setFixedWidth(100)
        row3.addWidget(self.limit_spin)
        row3.addStretch()
        v.addLayout(row3)

        v.addStretch()

        # About
        about = QFrame()
        about.setObjectName("card")
        av = QVBoxLayout(about)
        av.setSpacing(10)

        at = QLabel("About Tuk Desktop")
        at.setStyleSheet(f"font-size: 14pt; font-weight: bold; color: {C['text']}; background: transparent;")
        av.addWidget(at)

        ad = QLabel("A desktop app for capturing screenshots and managing clipboard content.\n\nVersion 1.0")
        ad.setStyleSheet(f"color: {C['subtext0']}; background: transparent;")
        ad.setWordWrap(True)
        av.addWidget(ad)
        v.addWidget(about)
        return page

    def _section_label(self, text):
        lbl = QLabel(text)
        lbl.setStyleSheet(f"font-size: 14pt; font-weight: bold; color: {C['text']}; background: transparent;")
        return lbl

    # ============================================================
    # NAVIGATION
    # ============================================================
    def switch_view(self, view):
        idx = {"captures": 0, "history": 1, "pinned": 2, "settings": 3}[view]
        self.stack.setCurrentIndex(idx)
        for k, btn in self.nav_btns.items():
            active = k == view
            btn.setObjectName("navBtnActive" if active else "navBtn")
            btn.style().unpolish(btn)
            btn.style().polish(btn)
        if view == "history":
            self.refresh_history()
        elif view == "pinned":
            self.refresh_pinned()
        elif view == "captures":
            self.refresh_captures()

    # ============================================================
    # CLIPBOARD & CAPTURE LOGIC
    # ============================================================
    def on_clipboard_text_change(self, content):
        if not content:
            return
        item = ClipboardItem(content)
        self.history.insert(0, item)
        self._enforce_limit()
        self._update_stats()
        if self.stack.currentIndex() == 1:
            self.refresh_history()

    def on_clipboard_image_change(self, img):
        if img is None:
            return
        # Convert PIL Image to bytes
        img_bytes = image_to_bytes(img)
        item = ClipboardItem(img_bytes)
        item.is_image = True
        self.history.insert(0, item)
        self._enforce_limit()
        self._update_stats()
        self.toast.show_message("📷 Image captured from clipboard!")
        if self.stack.currentIndex() == 1:
            self.refresh_history()

    def capture_screen(self):
        scale_idx = self.scale_combo.currentIndex()
        scale = [1, 2, 4][scale_idx]
        
        self.capture_thread = ScreenCapture(scale=scale)
        self.capture_thread.capture_done.connect(self.on_capture_done)
        self.capture_thread.capture_error.connect(self.on_capture_error)
        self.capture_thread.start()
        self.toast.show_message("📸 Capturing screen...")

    def on_capture_done(self, img):
        if img is None:
            return
        img_bytes = image_to_bytes(img)
        item = ClipboardItem(img_bytes)
        item.is_image = True
        self.history.insert(0, item)
        self._enforce_limit()
        self._update_stats()
        self.toast.show_message(f"✅ Captured at {img.width}×{img.height}")
        if self.stack.currentIndex() == 0:
            self.refresh_captures()
        elif self.stack.currentIndex() == 1:
            self.refresh_history()

    def on_capture_error(self, error):
        self.toast.show_message(f"❌ Capture failed: {error}")

    def _enforce_limit(self):
        limit = self.limit_spin.value() if hasattr(self, 'limit_spin') else 100
        while len(self.history) > limit:
            removed = self.history.pop()
            if removed in self.pinned:
                self.pinned.remove(removed)

    def _update_stats(self):
        if hasattr(self, 'hist_stat'):
            self.hist_stat.setText(f"{len(self.history)} items")
        if hasattr(self, 'pin_stat'):
            self.pin_stat.setText(f"{len(self.pinned)} items")
        if hasattr(self, 'capture_stat'):
            img_count = sum(1 for it in self.history if it.is_image)
            self.capture_stat.setText(f"{img_count} captures")

    def _update_type_filters(self):
        all_types = sorted(set(it.content_type for it in self.history) | set(it.content_type for it in self.pinned))

        for widget, current in [(getattr(self, 'hist_type_filter', None), None), 
                                 (getattr(self, 'pin_type_filter', None), None)]:
            if widget:
                current = widget.currentText()
                widget.blockSignals(True)
                widget.clear()
                widget.addItem("All Types")
                widget.addItems(all_types)
                if current in ["All Types"] + all_types:
                    widget.setCurrentText(current)
                widget.blockSignals(False)

    # ============================================================
    # CARDS
    # ============================================================
    def refresh_captures(self):
        while self.capture_layout.count() > 1:
            it = self.capture_layout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        for it in self.history:
            if not it.is_image:
                continue
            card = ClipCard(it, is_pinned=it.pinned)
            card.copy_signal.connect(self._copy_item)
            card.pin_signal.connect(self._toggle_pin)
            card.delete_signal.connect(self._delete_item)
            self.capture_layout.insertWidget(self.capture_layout.count() - 1, card)
        self._update_stats()

    def refresh_history(self):
        while self.hist_layout.count() > 1:
            it = self.hist_layout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        term = self.hist_search.text().lower() if hasattr(self, 'hist_search') else ""
        type_filter = self.hist_type_filter.currentText() if hasattr(self, 'hist_type_filter') else "All Types"

        for it in self.history:
            if term and term not in it.content.lower():
                continue
            if type_filter != "All Types" and it.content_type != type_filter:
                continue
            card = ClipCard(it, is_pinned=it.pinned)
            card.copy_signal.connect(self._copy_item)
            card.pin_signal.connect(self._toggle_pin)
            card.delete_signal.connect(self._delete_item)
            self.hist_layout.insertWidget(self.hist_layout.count() - 1, card)
        self._update_stats()
        self._update_type_filters()

    def refresh_pinned(self):
        while self.pin_layout.count() > 1:
            it = self.pin_layout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        term = self.pin_search.text().lower() if hasattr(self, 'pin_search') else ""
        type_filter = self.pin_type_filter.currentText() if hasattr(self, 'pin_type_filter') else "All Types"

        for it in self.pinned:
            if term and term not in it.content.lower():
                continue
            if type_filter != "All Types" and it.content_type != type_filter:
                continue
            card = ClipCard(it, is_pinned=True)
            card.copy_signal.connect(self._copy_item)
            card.pin_signal.connect(self._toggle_pin)
            card.delete_signal.connect(self._delete_item)
            self.pin_layout.insertWidget(self.pin_layout.count() - 1, card)
        self._update_stats()
        self._update_type_filters()

    def _copy_item(self, item):
        if item.is_image:
            # Copy image to clipboard
            try:
                from PIL import ImageGrab
                import pyperclip
                img = bytes_to_image(item.content)
                # Save to temp file and copy path for now (Qt limitation)
                # For images, we'll save to temp and let user know
                temp_path = os.path.join(os.environ.get('TEMP', '.'), 'tuk_capture.png')
                img.save(temp_path, 'PNG')
                self.toast.show_message(f"📷 Image saved to {temp_path}")
            except Exception as e:
                self.toast.show_message(f"Error copying image: {e}")
        else:
            import pyperclip
            pyperclip.copy(item.content)
            self.toast.show_message("📋 Copied!")

    def _toggle_pin(self, item):
        for it in self.history:
            if it.content == item.content:
                if it.pinned:
                    it.pinned = False
                    if it in self.pinned:
                        self.pinned.remove(it)
                    self.toast.show_message("Unpinned")
                else:
                    it.pinned = True
                    if it not in self.pinned:
                        self.pinned.append(it)
                    self.toast.show_message("📌 Pinned!")
                break
        self.refresh_history()
        self.refresh_pinned()

    def _delete_item(self, item):
        self.history = [it for it in self.history if it.content != item.content]
        self.pinned = [it for it in self.pinned if it.content != item.content]
        self.refresh_history()
        self.refresh_pinned()
        self.refresh_captures()
        self.toast.show_message("🗑 Deleted")

    # ============================================================
    # SETTINGS
    # ============================================================
    def save_settings(self):
        try:
            self.settings.setValue("auto_capture", self.set_auto_capture.isChecked())
            self.settings.setValue("monitor_clipboard", self.set_monitor_clipboard.isChecked())
            self.settings.setValue("history_limit", self.limit_spin.value())
            self.settings.setValue("scale", self.scale_combo.currentIndex())
        except Exception:
            pass

    def apply_saved_settings(self):
        try:
            self.set_auto_capture.setChecked(self.settings.value("auto_capture", True, type=bool))
            self.set_monitor_clipboard.setChecked(self.settings.value("monitor_clipboard", True, type=bool))
            self.limit_spin.setValue(self.settings.value("history_limit", 100, type=int))
            self.scale_combo.setCurrentIndex(self.settings.value("scale", 2, type=int))
        except Exception:
            pass

    def closeEvent(self, event):
        self.monitor.stop()
        self.monitor.wait()
        self.save_settings()
        event.accept()


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TukDesktopApp()
    window.show()
    sys.exit(app.exec())

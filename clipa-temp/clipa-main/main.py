import sys
import os
import pyperclip
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QTextEdit, QLabel, QCheckBox, QComboBox, QLineEdit,
    QMessageBox, QStackedWidget, QScrollArea, QFrame,
    QGraphicsDropShadowEffect, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QSettings, QSize, pyqtSignal
from PyQt6.QtGui import QFont, QIcon, QFontDatabase, QColor
from clipboard_manager import ClipboardMonitor, ClipboardItem, detect_type


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
    'blue': '#89b4fa',
    'lavender': '#b4befe',
    'green': '#a6e3a1',
    'red': '#f38ba8',
    'maroon': '#eba0ac',
    'yellow': '#f9e2af',
    'mauve': '#cba6f7',
    'peach': '#fab387',
}


def build_stylesheet():
    return f"""
    QMainWindow {{ background-color: {C['crust']}; }}
    QWidget {{ background-color: {C['crust']}; color: {C['text']}; font-family: 'Noto Sans Khmer','Khmer OS','Segoe UI',Arial,sans-serif; font-size: 10pt; }}

    QPushButton {{
        background-color: {C['surface0']}; border: none; border-radius: 8px;
        padding: 8px 16px; color: {C['text']};
    }}
    QPushButton:hover {{ background-color: {C['surface1']}; }}
    QPushButton:pressed {{ background-color: {C['surface2']}; }}

    QPushButton#primaryBtn {{ background-color: {C['blue']}; color: {C['crust']}; font-weight: bold; }}
    QPushButton#primaryBtn:hover {{ background-color: {C['lavender']}; }}

    QPushButton#dangerBtn {{ background-color: {C['red']}; color: {C['crust']}; font-weight: bold; }}
    QPushButton#dangerBtn:hover {{ background-color: {C['maroon']}; }}

    QPushButton#ghostBtn {{ background-color: transparent; color: {C['subtext0']}; }}
    QPushButton#ghostBtn:hover {{ background-color: {C['surface0']}; color: {C['text']}; }}

    QPushButton#iconBtn {{
        background-color: transparent; border-radius: 8px; padding: 4px;
        color: {C['subtext0']}; font-size: 14px; min-width: 32px; min-height: 32px;
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

    QTextEdit, QLineEdit {{
        background-color: {C['mantle']}; border: 1px solid {C['surface0']};
        border-radius: 10px; padding: 12px; color: {C['text']};
    }}
    QTextEdit:focus, QLineEdit:focus {{ border: 1px solid {C['blue']}; }}
    QTextEdit::placeholder {{ color: {C['overlay0']}; }}

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
    QLabel#badge {{
        background-color: {C['surface0']}; color: {C['blue']}; border-radius: 6px;
        padding: 2px 8px; font-size: 8pt;
    }}

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
    def __init__(self, parent, duration=1800):
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
    copy_signal = pyqtSignal(str)
    pin_signal = pyqtSignal(str)
    delete_signal = pyqtSignal(str)

    def __init__(self, item, is_pinned=False):
        super().__init__()
        self.setObjectName("card")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.item = item
        self.is_pinned = is_pinned
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(6)

        # Preview row
        top = QHBoxLayout()
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

        time_lbl = QLabel(item.timestamp.strftime("%H:%M"))
        time_lbl.setObjectName("cardMeta")
        meta.addWidget(time_lbl)

        meta.addStretch()
        layout.addLayout(meta)

    def on_copy(self):
        self.copy_signal.emit(self.item.content)

    def on_pin(self):
        self.pin_signal.emit(self.item.content)

    def on_delete(self):
        self.delete_signal.emit(self.item.content)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.on_copy()

    def _badge_style(self, t):
        colors = {
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
class ClipaApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.history = []
        self.pinned = []
        self.undo_stack = []
        self.redo_stack = []
        self.auto_paste = False
        self.settings = QSettings("Clipa", "Settings")
        self.load_settings()

        self.monitor = ClipboardMonitor()
        self.monitor.clipboard_changed.connect(self.on_clipboard_change)

        self.init_ui()
        self.apply_saved_settings()
        self.monitor.start()

    def init_ui(self):
        self.setWindowTitle("Clipa")
        self.setGeometry(120, 100, 1120, 740)
        self.setMinimumSize(900, 600)

        # Resources
        base = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        ico = os.path.join(base, "app_icon.ico")
        if os.path.exists(ico):
            self.setWindowIcon(QIcon(ico))

        font_path = os.path.join(base, "NotoSansKhmer.ttf")
        if os.path.exists(font_path):
            fid = QFontDatabase.addApplicationFont(font_path)
            if fid != -1:
                fam = QFontDatabase.applicationFontFamilies(fid)
                if fam:
                    QApplication.setFont(QFont(fam[0], 10))

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
        sidebar.setFixedWidth(210)
        sb = QVBoxLayout(sidebar)
        sb.setContentsMargins(14, 20, 14, 16)
        sb.setSpacing(8)

        logo = QLabel("📋 Clipa")
        logo.setObjectName("logoText")
        sb.addWidget(logo)

        sub = QLabel("កម្មវិធីគ្រប់គ្រង Clipboard")
        sub.setStyleSheet(f"color: {C['overlay1']}; font-size: 9pt; background: transparent;")
        sb.addWidget(sub)
        sb.addSpacing(24)

        self.nav_btns = {}
        for key, label in [("editor", "✏️ កែសម្រួល"), ("history", "🕐 ប្រវត្តិ"),
                           ("pinned", "📌 ភ្ជាប់រហូត"), ("settings", "⚙️ ការកំណត់")]:
            btn = QPushButton(label)
            btn.setObjectName("navBtn")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _, k=key: self.switch_view(k))
            self.nav_btns[key] = btn
            sb.addWidget(btn)

        sb.addStretch()

        foot = QLabel(f'<a href="https://t.me/tmeta9" style="color: {C["blue"]};">t.me/tmeta9</a>')
        foot.setOpenExternalLinks(True)
        foot.setStyleSheet(f"color: {C['overlay1']}; font-size: 8pt; background: transparent;")
        foot.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sb.addWidget(foot)

        main.addWidget(sidebar)

        # ---- CONTENT ----
        self.stack = QStackedWidget()
        self.stack.addWidget(self._editor_page())
        self.stack.addWidget(self._history_page())
        self.stack.addWidget(self._pinned_page())
        self.stack.addWidget(self._settings_page())
        main.addWidget(self.stack, 1)

        self.toast = Toast(self)
        self.switch_view("editor")

    def _editor_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(18)

        title = QLabel("✏️ កែសម្រួល")
        title.setObjectName("sectionTitle")
        v.addWidget(title)

        # Toolbar
        tb = QHBoxLayout()
        self.auto_paste_cb = QCheckBox("បិទបើកស្វ័យប្រវត្តិ")
        self.auto_paste_cb.stateChanged.connect(self._toggle_auto_paste)
        tb.addWidget(self.auto_paste_cb)

        tb.addSpacing(16)
        tb.addWidget(QLabel("Separator:"))

        self.sep_combo = QComboBox()
        self.sep_combo.addItems(["មួយជួរ (New Line)", ", (Comma)", "  (Space)", "⇥ (Tab)"])
        self.sep_combo.setFixedWidth(150)
        tb.addWidget(self.sep_combo)

        tb.addStretch()

        for name, slot in [("↩ មិនធ្វើ", self.undo), ("↪ ធ្វើវិញ", self.redo),
                           ("បំបែក", self.split_text), ("បញ្ចូលគ្នា", self.merge_text)]:
            btn = QPushButton(name)
            btn.setObjectName("primaryBtn" if name in ("បំបែក", "បញ្ចូលគ្នា") else "ghostBtn")
            btn.clicked.connect(slot)
            tb.addWidget(btn)

        v.addLayout(tb)

        # Text area
        self.text_area = QTextEdit()
        self.text_area.setPlaceholderText("ទិន្នន័យដែល : \n១២៣៤៥៦៧\nទីនេះ\nសម្រាប់...")
        self.text_area.setMinimumHeight(340)
        v.addWidget(self.text_area, 1)

        # Bottom bar
        bot = QHBoxLayout()
        for name, slot in [("📋 បិទភ្ជាប់", self.paste_content), ("📄 ចម្លងទាំងអស់", self.copy_all)]:
            btn = QPushButton(name)
            btn.setObjectName("ghostBtn")
            btn.clicked.connect(slot)
            bot.addWidget(btn)

        bot.addStretch()

        clr = QPushButton("🗑 លុបទាំងអស់")
        clr.setObjectName("dangerBtn")
        clr.clicked.connect(self.clear_all)
        bot.addWidget(clr)
        v.addLayout(bot)

        return page

    def _history_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(28, 28, 28, 28)
        v.setSpacing(18)

        hdr = QHBoxLayout()
        title = QLabel("🕐 ប្រវត្តិ")
        title.setObjectName("sectionTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        self.hist_type_filter = QComboBox()
        self.hist_type_filter.addItem("ប្រភេទទាំងអស់")
        self.hist_type_filter.setFixedWidth(150)
        self.hist_type_filter.currentTextChanged.connect(self.refresh_history)
        hdr.addWidget(self.hist_type_filter)

        self.hist_search = QLineEdit()
        self.hist_search.setPlaceholderText("🔍 ស្វែងរកប្រវត្តិ...")
        self.hist_search.setFixedWidth(250)
        self.hist_search.textChanged.connect(self.refresh_history)
        hdr.addWidget(self.hist_search)
        v.addLayout(hdr)

        self.hist_stat = QLabel("0 ធាតុ")
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
        title = QLabel("📌 ភ្ជាប់រហូត")
        title.setObjectName("sectionTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        self.pin_type_filter = QComboBox()
        self.pin_type_filter.addItem("ប្រភេទទាំងអស់")
        self.pin_type_filter.setFixedWidth(150)
        self.pin_type_filter.currentTextChanged.connect(self.refresh_pinned)
        hdr.addWidget(self.pin_type_filter)

        self.pin_search = QLineEdit()
        self.pin_search.setPlaceholderText("🔍 ស្វែងរកភ្ជាប់រហូត...")
        self.pin_search.setFixedWidth(250)
        self.pin_search.textChanged.connect(self.refresh_pinned)
        hdr.addWidget(self.pin_search)
        v.addLayout(hdr)

        self.pin_stat = QLabel("0 ធាតុ")
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

        title = QLabel("⚙️ ការកំណត់")
        title.setObjectName("sectionTitle")
        v.addWidget(title)

        # General
        v.addWidget(self._section_label("ទូទៅ"))

        row1 = QHBoxLayout()
        self.set_auto_paste = QCheckBox("បើកស្វ័យប្រវត្តិបិទភ្ជាប់")
        self.set_auto_paste.stateChanged.connect(self._toggle_auto_paste_from_settings)
        row1.addWidget(self.set_auto_paste)
        desc = QLabel("បន្ថែមទិន្នន័យ clipboard ទៅក្នុងកម្មវិធីកែសម្រួលដោយស្វ័យប្រវត្តិ")
        desc.setObjectName("cardMeta")
        row1.addWidget(desc)
        row1.addStretch()
        v.addLayout(row1)

        row2 = QHBoxLayout()
        row2.addWidget(QLabel("ដែនកំណត់ប្រវត្តិ:"))
        self.limit_combo = QComboBox()
        self.limit_combo.addItems(["50", "100", "200", "500"])
        self.limit_combo.setFixedWidth(100)
        row2.addWidget(self.limit_combo)
        row2.addStretch()
        v.addLayout(row2)

        v.addStretch()

        # About card
        about = QFrame()
        about.setObjectName("card")
        av = QVBoxLayout(about)
        av.setSpacing(10)

        at = QLabel("អំពី Clipa")
        at.setStyleSheet(f"font-size: 14pt; font-weight: bold; color: {C['text']}; background: transparent;")
        av.addWidget(at)

        ad = QLabel("កម្មវិធីគ្រប់គ្រង Clipboard ដែលមានមុខងារបំបែក និងបញ្ចូលគ្នា និងគាំទ្រភាសាខ្មែរ។\n\nកំណែ 1.0")
        ad.setStyleSheet(f"color: {C['subtext0']}; background: transparent;")
        ad.setWordWrap(True)
        av.addWidget(ad)

        contact = QLabel(f'<a href="https://t.me/tmeta9" style="color: {C["blue"]};">ទំនាក់ទំនង: t.me/tmeta9</a>')
        contact.setOpenExternalLinks(True)
        contact.setStyleSheet("background: transparent;")
        av.addWidget(contact)
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
        idx = {"editor": 0, "history": 1, "pinned": 2, "settings": 3}[view]
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

    # ============================================================
    # CLIPBOARD LOGIC
    # ============================================================
    def _toggle_auto_paste(self, state):
        self.auto_paste = state == Qt.CheckState.Checked.value
        if hasattr(self, 'set_auto_paste'):
            self.set_auto_paste.setChecked(self.auto_paste)
        self.save_settings()

    def _toggle_auto_paste_from_settings(self, state):
        self.auto_paste = state == Qt.CheckState.Checked.value
        if hasattr(self, 'auto_paste_cb'):
            self.auto_paste_cb.setChecked(self.auto_paste)
        self.save_settings()

    def on_clipboard_change(self, content):
        if not content or content in [it.content for it in self.history]:
            return
        item = ClipboardItem(content)
        self.history.insert(0, item)

        limit = int(self.limit_combo.currentText()) if hasattr(self, 'limit_combo') else 100
        while len(self.history) > limit:
            removed = self.history.pop()
            if removed in self.pinned:
                self.pinned.remove(removed)

        if self.auto_paste:
            cur = self.text_area.toPlainText()
            sep = self._get_separator()
            self.text_area.setPlainText(cur + sep + content if cur else content)

        self._update_stats()
        if self.stack.currentIndex() == 1:
            self.refresh_history()

    def _update_stats(self):
        if hasattr(self, 'hist_stat'):
            self.hist_stat.setText(f"{len(self.history)} items")
        if hasattr(self, 'pin_stat'):
            self.pin_stat.setText(f"{len(self.pinned)} items")

    def _update_type_filters(self):
        # Collect all unique types
        all_types = sorted(set(it.content_type for it in self.history) | set(it.content_type for it in self.pinned))

        # Update history filter without triggering refresh
        if hasattr(self, 'hist_type_filter'):
            current = self.hist_type_filter.currentText()
            self.hist_type_filter.blockSignals(True)
            self.hist_type_filter.clear()
            self.hist_type_filter.addItem("ប្រភេទទាំងអស់")
            self.hist_type_filter.addItems(all_types)
            if current in ["ប្រភេទទាំងអស់"] + all_types:
                self.hist_type_filter.setCurrentText(current)
            self.hist_type_filter.blockSignals(False)

        # Update pinned filter without triggering refresh
        if hasattr(self, 'pin_type_filter'):
            current = self.pin_type_filter.currentText()
            self.pin_type_filter.blockSignals(True)
            self.pin_type_filter.clear()
            self.pin_type_filter.addItem("ប្រភេទទាំងអស់")
            self.pin_type_filter.addItems(all_types)
            if current in ["ប្រភេទទាំងអស់"] + all_types:
                self.pin_type_filter.setCurrentText(current)
            self.pin_type_filter.blockSignals(False)

    # ============================================================
    # CARDS
    # ============================================================
    def refresh_history(self):
        while self.hist_layout.count() > 1:
            it = self.hist_layout.takeAt(0)
            if it.widget():
                it.widget().deleteLater()

        term = self.hist_search.text().lower() if hasattr(self, 'hist_search') else ""
        type_filter = self.hist_type_filter.currentText() if hasattr(self, 'hist_type_filter') else "ប្រភេទទាំងអស់"

        for it in self.history:
            if term and term not in it.content.lower():
                continue
            if type_filter != "ប្រភេទទាំងអស់" and it.content_type != type_filter:
                continue
            card = ClipCard(it, is_pinned=it.pinned)
            card.copy_signal.connect(self._copy_text)
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
        type_filter = self.pin_type_filter.currentText() if hasattr(self, 'pin_type_filter') else "ប្រភេទទាំងអស់"

        for it in self.pinned:
            if term and term not in it.content.lower():
                continue
            if type_filter != "ប្រភេទទាំងអស់" and it.content_type != type_filter:
                continue
            card = ClipCard(it, is_pinned=True)
            card.copy_signal.connect(self._copy_text)
            card.pin_signal.connect(self._toggle_pin)
            card.delete_signal.connect(self._delete_item)
            self.pin_layout.insertWidget(self.pin_layout.count() - 1, card)
        self._update_stats()
        self._update_type_filters()

    def _copy_text(self, content):
        pyperclip.copy(content)
        self.toast.show_message("បានចម្លង!")

    def _toggle_pin(self, content):
        for it in self.history:
            if it.content == content:
                if it.pinned:
                    it.pinned = False
                    if it in self.pinned:
                        self.pinned.remove(it)
                    self.toast.show_message("បានលុបភ្ជាប់រហូត")
                else:
                    it.pinned = True
                    if it not in self.pinned:
                        self.pinned.append(it)
                    self.toast.show_message("បានភ្ជាប់រហូត")
                break
        self.refresh_history()
        self.refresh_pinned()

    def _delete_item(self, content):
        self.history = [it for it in self.history if it.content != content]
        self.pinned = [it for it in self.pinned if it.content != content]
        self.refresh_history()
        self.refresh_pinned()
        self.toast.show_message("បានលុប")

    # ============================================================
    # EDITOR OPERATIONS
    # ============================================================
    def _get_separator(self):
        idx = self.sep_combo.currentIndex() if hasattr(self, 'sep_combo') else 0
        return {0: '\n', 1: ', ', 2: ' ', 3: '\t'}.get(idx, '\n')

    def split_text(self):
        text = self.text_area.toPlainText()
        sep = self._get_separator()
        if sep and text:
            self.undo_stack.append(text)
            self.redo_stack.clear()
            self.text_area.setPlainText(text.replace(sep, '\n'))
            self.toast.show_message("បំបែករួចរាល់!")

    def merge_text(self):
        text = self.text_area.toPlainText()
        sep = self._get_separator()
        if text:
            self.undo_stack.append(text)
            self.redo_stack.clear()
            lines = [ln.strip() for ln in text.split('\n') if ln.strip()]
            self.text_area.setPlainText(sep.join(lines))
            self.toast.show_message("បញ្ចូលគ្នារួចរាល់!")

    def undo(self):
        if self.undo_stack:
            self.redo_stack.append(self.text_area.toPlainText())
            self.text_area.setPlainText(self.undo_stack.pop())
            self.toast.show_message("មិនធ្វើ!")

    def redo(self):
        if self.redo_stack:
            self.undo_stack.append(self.text_area.toPlainText())
            self.text_area.setPlainText(self.redo_stack.pop())
            self.toast.show_message("ធ្វើវិញ!")

    def copy_all(self):
        text = self.text_area.toPlainText()
        if text:
            pyperclip.copy(text)
            self.toast.show_message("បានចម្លងទាំងអស់!")

    def paste_content(self):
        try:
            self.text_area.setPlainText(pyperclip.paste())
            self.toast.show_message("បិទភ្ជាប់!")
        except Exception:
            pass

    def clear_all(self):
        reply = QMessageBox.question(
            self, "លុបទាំងអស់",
            "តើអ្នកចង់លុបប្រវត្តិទាំងអស់មែនទេ?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            self.history.clear()
            self.pinned.clear()
            self.text_area.clear()
            self.refresh_history()
            self.refresh_pinned()
            self.toast.show_message("បានលុប!")

    # ============================================================
    # SETTINGS
    # ============================================================
    def save_settings(self):
        self.settings.setValue("auto_paste", self.auto_paste)
        self.settings.setValue("separator_index", self.sep_combo.currentIndex() if hasattr(self, 'sep_combo') else 0)

    def load_settings(self):
        self.auto_paste = self.settings.value("auto_paste", False, type=bool)
        self.saved_sep_idx = self.settings.value("separator_index", 0, type=int)

    def apply_saved_settings(self):
        if hasattr(self, 'auto_paste_cb'):
            self.auto_paste_cb.setChecked(self.auto_paste)
        if hasattr(self, 'set_auto_paste'):
            self.set_auto_paste.setChecked(self.auto_paste)
        if hasattr(self, 'sep_combo'):
            self.sep_combo.setCurrentIndex(self.saved_sep_idx)
        if hasattr(self, 'sep_combo'):
            self.sep_combo.currentIndexChanged.connect(self.save_settings)

    def closeEvent(self, event):
        self.save_settings()
        self.monitor.stop()
        self.monitor.wait()
        event.accept()


if __name__ == '__main__':
    app = QApplication(sys.argv)
    win = ClipaApp()
    win.show()
    sys.exit(app.exec())

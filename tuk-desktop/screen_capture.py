import mss
import mss.tools
from PIL import Image
from PyQt6.QtCore import QThread, pyqtSignal
from datetime import datetime
import io


class ScreenCapture(QThread):
    """Captures screen/region and returns image data."""
    capture_done = pyqtSignal(object)  # PIL Image
    capture_error = pyqtSignal(str)
    
    def __init__(self, scale=1):
        super().__init__()
        self.scale = scale
        self.region = None  # (left, top, width, height) or None for fullscreen
    
    def run(self):
        try:
            with mss.mss() as sct:
                if self.region:
                    monitor = {
                        "left": self.region[0],
                        "top": self.region[1],
                        "width": self.region[2],
                        "height": self.region[3]
                    }
                else:
                    # Capture primary monitor
                    monitor = sct.monitors[1]
                
                # Capture
                screenshot = sct.grab(monitor)
                
                # Convert to PIL Image
                img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
                
                # Scale if needed
                if self.scale != 1:
                    new_size = (int(img.width * self.scale), int(img.height * self.scale))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                self.capture_done.emit(img)
                
        except Exception as e:
            self.capture_error.emit(str(e))


def capture_screen(scale=1):
    """Capture the primary screen at the given scale multiplier."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        screenshot = sct.grab(monitor)
        img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
        
        if scale != 1:
            new_size = (int(img.width * scale), int(img.height * scale))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        return img


def image_to_bytes(img, format='PNG'):
    """Convert PIL Image to bytes."""
    buffer = io.BytesIO()
    img.save(buffer, format=format)
    return buffer.getvalue()


def bytes_to_image(data):
    """Convert bytes to PIL Image."""
    return Image.open(io.BytesIO(data))

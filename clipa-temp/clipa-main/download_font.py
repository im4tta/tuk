import urllib.request
import os

# Download Noto Sans Khmer font
font_url = "https://github.com/google/fonts/raw/main/ofl/notosanskhmer/NotoSansKhmer%5Bwdth%2Cwght%5D.ttf"
font_path = "NotoSansKhmer.ttf"

if not os.path.exists(font_path):
    print("Downloading Noto Sans Khmer font...")
    try:
        urllib.request.urlretrieve(font_url, font_path)
        print(f"✓ Font downloaded: {font_path}")
    except Exception as e:
        print(f"Error downloading font: {e}")
        print("Trying alternative URL...")
        # Try alternative
        font_url2 = "https://fonts.gstatic.com/s/notosanskhmer/v23/ijw3s5roRME5LLRxjsRb-gssOenAyendxrgV2c-Zw-9vbVUti_Z_dWgtWYuNAZz4kAbrddiA.ttf"
        urllib.request.urlretrieve(font_url2, font_path)
        print(f"✓ Font downloaded: {font_path}")
else:
    print(f"✓ Font already exists: {font_path}")

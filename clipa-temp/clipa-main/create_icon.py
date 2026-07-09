from PIL import Image, ImageDraw, ImageFont
import os

# Create a 256x256 icon
size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Colors matching the app theme
bg_color = (30, 30, 46, 255)  # Dark background
accent_color = (166, 227, 161, 255)  # Green accent
border_color = (137, 180, 250, 255)  # Blue border

# Draw rounded rectangle background
margin = 20
draw.rounded_rectangle(
    [margin, margin, size-margin, size-margin],
    radius=30,
    fill=bg_color,
    outline=border_color,
    width=8
)

# Draw clipboard shape
clipboard_margin = 60
clipboard_top = 50
clipboard_bottom = size - 50
clipboard_left = 70
clipboard_right = size - 70

# Clipboard clip at top
clip_width = 60
clip_height = 20
clip_x = (size - clip_width) // 2
clip_y = clipboard_top - 10
draw.rounded_rectangle(
    [clip_x, clip_y, clip_x + clip_width, clip_y + clip_height],
    radius=8,
    fill=border_color
)

# Clipboard body
draw.rounded_rectangle(
    [clipboard_left, clipboard_top, clipboard_right, clipboard_bottom],
    radius=15,
    fill=(24, 24, 37, 255),
    outline=accent_color,
    width=6
)

# Draw lines representing text
line_color = accent_color
line_margin = 90
line_spacing = 25
line_y = 90

for i in range(4):
    y = line_y + (i * line_spacing)
    width = 90 if i % 2 == 0 else 70
    draw.rounded_rectangle(
        [line_margin, y, line_margin + width, y + 8],
        radius=4,
        fill=line_color
    )

# Save as ICO file with multiple sizes
icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
images = []

for icon_size in icon_sizes:
    resized = img.resize(icon_size, Image.Resampling.LANCZOS)
    images.append(resized)

# Save as .ico
images[0].save('app_icon.ico', format='ICO', sizes=[(s[0], s[1]) for s in icon_sizes], append_images=images[1:])

# Also save as PNG for preview
img.save('app_icon.png', 'PNG')

print("✓ Icon created: app_icon.ico")
print("✓ Preview created: app_icon.png")

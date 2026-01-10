#!/usr/bin/env python3
"""
Create transparent PNG logo icons
"""
from PIL import Image, ImageDraw

def create_logo(size=1024):
    """Create a logo with transparent background"""
    # Create image with transparent background (RGBA mode)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate sizes
    gray_square_size = int(size * 0.90)  # 90% of canvas
    offset = (size - gray_square_size) // 2
    corner_radius = int(gray_square_size * 0.18)  # 18% for iOS-style corners
    
    # Draw dark gray rounded rectangle background
    draw.rounded_rectangle(
        [(offset, offset), (offset + gray_square_size, offset + gray_square_size)],
        radius=corner_radius,
        fill=(68, 68, 68, 255)  # #444444
    )
    
    # Calculate notepad size (85% of gray square)
    notepad_size = int(gray_square_size * 0.85)
    notepad_offset = offset + (gray_square_size - notepad_size) // 2
    notepad_corner = int(notepad_size * 0.05)
    
    # Draw white notepad
    draw.rounded_rectangle(
        [(notepad_offset, notepad_offset), 
         (notepad_offset + notepad_size, notepad_offset + notepad_size)],
        radius=notepad_corner,
        fill=(255, 255, 255, 255)
    )
    
    # Draw text lines on notepad
    line_width = int(notepad_size * 0.6)
    line_start_x = notepad_offset + int(notepad_size * 0.2)
    line_end_x = line_start_x + line_width
    line_thickness = max(3, int(size * 0.012))
    
    # Line positions (5 lines)
    line_y_positions = [
        notepad_offset + int(notepad_size * 0.25),
        notepad_offset + int(notepad_size * 0.40),
        notepad_offset + int(notepad_size * 0.50),  # This one will have highlight
        notepad_offset + int(notepad_size * 0.65),
        notepad_offset + int(notepad_size * 0.80),
    ]
    
    # Draw yellow highlight on third line
    highlight_y = line_y_positions[2]
    highlight_height = int(notepad_size * 0.06)
    highlight_padding = int(notepad_size * 0.03)
    draw.rounded_rectangle(
        [(line_start_x - highlight_padding, highlight_y - highlight_height // 2),
         (line_end_x + highlight_padding, highlight_y + highlight_height // 2)],
        radius=int(highlight_height * 0.2),
        fill=(255, 193, 7, 230)  # #FFC107 with slight transparency
    )
    
    # Draw all text lines
    for i, y in enumerate(line_y_positions):
        # Last line is shorter
        end_x = line_end_x if i < 4 else line_start_x + int(line_width * 0.6)
        draw.line(
            [(line_start_x, y), (end_x, y)],
            fill=(0, 0, 0, 255),
            width=line_thickness
        )
    
    return img

if __name__ == '__main__':
    # Create 1024x1024 version
    logo_1024 = create_logo(1024)
    logo_1024.save('logo-1024.png', 'PNG')
    print("Created logo-1024.png")
    
    # Create smaller versions
    logo_128 = create_logo(128)
    logo_128.save('logo128.png', 'PNG')
    print("Created logo128.png")
    
    logo_48 = create_logo(48)
    logo_48.save('logo48.png', 'PNG')
    print("Created logo48.png")
    
    logo_16 = create_logo(16)
    logo_16.save('logo16.png', 'PNG')
    print("Created logo16.png")
    
    print("\nAll PNG icons created with transparent backgrounds!")

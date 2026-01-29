"""
Image Display Examples

Demonstrates displaying images in various formats using IPython.display.Image
"""

from IPython.display import Image, SVG, display, HTML

# Display PNG image
Image('pea.png')

# Display with custom width
Image('pea.png', width=100)

# Display with custom height
Image('pea.png', height=50)

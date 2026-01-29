"""
## F-string Markdown

F-strings now render as markdown, just like regular string literals.
"""

version = "0.6.0"

items = ["F-string markdown", "Image sizing"]

f"""
### New in {version}

{chr(10).join(f'- {item}' for item in items)}
"""

"""
## Image Sizing

`IPython.display.Image` now respects `width` and `height` parameters.
"""

from IPython.display import Image

Image("pea.png", height=50)

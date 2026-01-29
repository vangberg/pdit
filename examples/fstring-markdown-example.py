"""
# F-string Markdown

F-strings can be used for dynamic markdown content.
"""

name = "pdit"
version = "0.6.0"

f"## Welcome to **{name}** v{version}"

items = ["Fast execution", "Live output", "Markdown support"]

f"""
### Features

{chr(10).join(f'- {item}' for item in items)}
"""

result = 2 + 2

f"The answer is `{result}`"

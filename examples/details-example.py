class ExpandableDetails:
    def __init__(self, title, items):
        self.title = title
        self.items = items

    def _repr_html_(self):
        items_html = "".join(f"<li>{item}</li>" for item in self.items)
        return f"""
        <details style="margin: 8px 0; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <summary style="cursor: pointer; font-weight: bold;">{self.title}</summary>
            <ul style="margin: 8px 0 0 0; padding-left: 24px;">
                {items_html}
            </ul>
        </details>
        """

ExpandableDetails("Fruits", ["Apple", "Banana", "Cherry", "Date", "Elderberry"])

ExpandableDetails("Programming Languages", [
    "Python - great for data science",
    "JavaScript - runs everywhere",
    "Rust - memory safe and fast",
    "Go - simple and concurrent",
])

class NestedDetails:
    def _repr_html_(self):
        return """
        <details style="margin: 8px 0; padding: 8px; border: 1px solid #3498db; border-radius: 4px;">
            <summary style="cursor: pointer; font-weight: bold; color: #3498db;">Project Structure</summary>
            <details style="margin: 8px 0 0 16px; padding: 8px; border: 1px solid #9b59b6; border-radius: 4px;">
                <summary style="cursor: pointer; color: #9b59b6;">Backend</summary>
                <ul><li>server.py</li><li>executor.py</li><li>cli.py</li></ul>
            </details>
            <details style="margin: 8px 0 0 16px; padding: 8px; border: 1px solid #27ae60; border-radius: 4px;">
                <summary style="cursor: pointer; color: #27ae60;">Frontend</summary>
                <ul><li>Script.tsx</li><li>Editor.tsx</li><li>Output.tsx</li></ul>
            </details>
        </details>
        """

NestedDetails()

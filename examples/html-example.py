class HTMLRep:
    def _repr_html_(self):
        return """
        <div style="padding: 20px; background-color: #f0f8ff; border: 2px solid #4682b4; border-radius: 8px;">
            <h3 style="color: #4682b4; margin-top: 0;">Custom HTML Representation</h3>
            <p>This HTML is rendered directly in the DOM, not in an iframe.</p>
            <button onclick="alert('Hello from the button!')" style="padding: 8px 16px; background-color: #4682b4; color: white; border: none; border-radius: 4px; cursor: pointer;">Click Me</button>
            <script>
                console.log('Script executed from _repr_html_');
            </script>
        </div>
        """

HTMLRep()

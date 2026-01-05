"""Display utility for KernelStateMachine actions."""

from html import escape
from pdit.kernel_session import (
    Action,
    SendToClient,
    ExecuteCode,
    InterruptKernel,
    ExpressionInfoList,
    StatementDone,
    StreamOutput,
    ScriptDone,
    ExecutionError,
)


class ActionDisplay:
    """Renders KernelStateMachine actions as HTML."""

    def __init__(self, actions: list[Action]):
        self.actions = actions

    def _repr_html_(self) -> str:
        if not self.actions:
            return '<div style="color: #888; font-style: italic;">No actions</div>'

        parts = [self._render_action(a) for a in self.actions]
        return f'<div style="font-family: system-ui, sans-serif; font-size: 14px;">{"".join(parts)}</div>'

    def _render_action(self, action: Action) -> str:
        match action:
            case SendToClient(data):
                return self._render_send_to_client(data)
            case ExecuteCode(code, silent):
                label = "ExecuteCode (silent)" if silent else "ExecuteCode"
                return self._box(label, self._code_block(code), "#e3f2fd", to_kernel=True)
            case InterruptKernel():
                return self._box("InterruptKernel", "Signal sent", "#fff3e0", to_kernel=True)

    def _render_send_to_client(self, data) -> str:
        match data:
            case ExpressionInfoList(expressions):
                rows = "".join(
                    f"<tr><td>{e.node_index}</td><td>{e.line_start}-{e.line_end}</td></tr>"
                    for e in expressions
                )
                table = f'<table style="border-collapse: collapse; font-size: 12px;"><tr style="background: #f5f5f5;"><th style="padding: 4px 8px; text-align: left;">Index</th><th style="padding: 4px 8px; text-align: left;">Lines</th></tr>{rows}</table>'
                return self._box("ExpressionInfoList", table, "#f3e5f5", to_kernel=False)
            case StatementDone(result):
                outputs = "".join(
                    f'<div style="margin: 2px 0;"><span style="background: #e0e0e0; padding: 1px 4px; border-radius: 2px; font-size: 11px;">{o.type}</span> {escape(str(o.content)[:100])}</div>'
                    for o in result.output
                ) or "<em>no output</em>"
                content = f"<div>node={result.node_index} lines={result.line_start}-{result.line_end}</div>{outputs}"
                return self._box("StatementDone", content, "#e8f5e9", to_kernel=False)
            case StreamOutput(outputs):
                items = "".join(
                    f'<div><span style="background: #e0e0e0; padding: 1px 4px; border-radius: 2px; font-size: 11px;">{o.type}</span> {escape(str(o.content)[:100])}</div>'
                    for o in outputs
                )
                return self._box("StreamOutput", items, "#fff8e1", to_kernel=False)
            case ScriptDone():
                return self._box("ScriptDone", "Execution complete", "#e0f7fa", to_kernel=False)
            case ExecutionError(message):
                return self._box("ExecutionError", escape(message), "#ffebee", to_kernel=False)

    def _box(self, title: str, content: str, bg: str, to_kernel: bool) -> str:
        if to_kernel:
            arrow = '<span style="color: #1565c0; margin-right: 6px;">&#x2192; kernel</span>'
        else:
            arrow = '<span style="color: #2e7d32; margin-right: 6px;">&#x2192; client</span>'
        return f'''<div style="background: {bg}; border-radius: 6px; padding: 8px 12px; margin: 4px 0;">
            <div style="font-weight: 600; margin-bottom: 4px;">{arrow}{title}</div>
            <div>{content}</div>
        </div>'''

    def _code_block(self, code: str) -> str:
        return f'<pre style="background: #263238; color: #aed581; padding: 8px; border-radius: 4px; margin: 0; overflow-x: auto;">{escape(code)}</pre>'

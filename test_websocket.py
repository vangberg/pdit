#!/usr/bin/env python3
"""Test WebSocket execution endpoint."""

import asyncio
import json
import websockets
import uuid

async def test_websocket_execution():
    """Test the WebSocket execute endpoint."""

    # Connect to WebSocket
    uri = "ws://127.0.0.1:8888/ws/execute"

    print("🔌 Connecting to WebSocket...")
    async with websockets.connect(uri) as websocket:

        # 1. Send init message
        session_id = str(uuid.uuid4())
        init_msg = {
            "type": "init",
            "sessionId": session_id
        }
        print(f"📤 Sending init: {init_msg}")
        await websocket.send(json.dumps(init_msg))

        # Wait for init-ack
        response = await websocket.recv()
        data = json.loads(response)
        print(f"📥 Received: {data}")

        if data.get("type") != "init-ack":
            print("❌ Failed to receive init-ack")
            return

        print("✅ Connected and initialized!")

        # 2. Send execute message
        execution_id = str(uuid.uuid4())
        execute_msg = {
            "type": "execute",
            "executionId": execution_id,
            "script": """
print("Hello WebSocket!")

x = 42
x + 1

# Test loop
for i in range(3):
    print(f"Iteration {i}")
""",
            "scriptName": "test.py"
        }

        print(f"\n📤 Sending execute request...")
        await websocket.send(json.dumps(execute_msg))

        # 3. Receive execution events
        print("\n📥 Receiving execution events:\n")

        while True:
            response = await websocket.recv()
            data = json.loads(response)

            msg_type = data.get("type")

            if msg_type == "execution-started":
                print(f"🚀 Execution started with {len(data['expressions'])} expressions")
                for expr in data['expressions']:
                    print(f"   - Lines {expr['lineStart']}-{expr['lineEnd']}")

            elif msg_type == "expression-done":
                print(f"\n✓ Expression done (lines {data['lineStart']}-{data['lineEnd']}):")
                if data['output']:
                    for output in data['output']:
                        print(f"   [{output['type']}]: {output['content'][:100]}")
                else:
                    print("   (no output)")

            elif msg_type == "execution-complete":
                print("\n🎉 Execution complete!")
                break

            elif msg_type == "execution-error":
                print(f"\n❌ Error: {data['error']}")
                break

            elif msg_type == "execution-cancelled":
                print("\n⚠️  Execution cancelled")
                break

        print("\n✅ Test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_websocket_execution())

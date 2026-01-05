#!/usr/bin/env node
/**
 * Test what messages we get on interrupt
 */

import { WebSocket } from 'ws';

console.log('🧪 Testing interrupt messages...\n');

const ws = new WebSocket('ws://127.0.0.1:8889/ws/execute');

let executionId;

ws.on('open', () => {
    console.log('✅ WebSocket connected');

    const sessionId = crypto.randomUUID();
    ws.send(JSON.stringify({ type: 'init', sessionId }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`📨 Received: ${msg.type}`, msg.executionId ? `(${msg.executionId.slice(0, 8)}...)` : '');

    if (msg.type === 'init-ack') {
        executionId = crypto.randomUUID();
        console.log('📤 Starting infinite loop...\n');
        ws.send(JSON.stringify({
            type: 'execute',
            executionId,
            script: `import time
for i in range(1000):
    print(f"Iteration {i}")
    time.sleep(0.1)`,
            scriptName: 'test.py'
        }));

        setTimeout(() => {
            console.log('\n⚡ Sending interrupt...\n');
            ws.send(JSON.stringify({ type: 'interrupt' }));
        }, 1000);
    }
    else if (msg.type === 'expression-done') {
        if (msg.output && msg.output.length > 0) {
            const output = msg.output[0];
            console.log(`  Output type: ${output.type}`);
            if (output.type === 'error') {
                console.log(`  Error content: ${output.content.substring(0, 100)}...`);
            }
        }
    }
    else if (msg.type === 'execution-cancelled' || msg.type === 'interrupt-ack') {
        console.log(`  ✅ Got ${msg.type}`);
    }
});

// Timeout
setTimeout(() => {
    console.log('\n✅ Done');
    ws.close();
    process.exit(0);
}, 5000);

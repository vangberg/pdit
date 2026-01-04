#!/usr/bin/env node
/**
 * Test the simplified WebSocket implementation
 */

import { WebSocket } from 'ws';

console.log('🧪 Testing simplified WebSocket server...\n');

const ws = new WebSocket('ws://127.0.0.1:8889/ws/execute');

ws.on('open', () => {
    console.log('✅ WebSocket connected');

    // Send init
    const sessionId = crypto.randomUUID();
    const initMsg = {
        type: 'init',
        sessionId: sessionId
    };
    console.log(`📤 Sending init with sessionId: ${sessionId}`);
    ws.send(JSON.stringify(initMsg));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'init-ack') {
        console.log('✅ Session initialized');

        // Send execute
        const executionId = crypto.randomUUID();
        const executeMsg = {
            type: 'execute',
            executionId: executionId,
            script: `print("Hello from simplified server!")
x = 42
x + 1

# Test loop
for i in range(3):
    print(f"Iteration {i}")`,
            scriptName: 'test.py'
        };
        console.log('📤 Sending execute request');
        ws.send(JSON.stringify(executeMsg));
    }
    else if (msg.type === 'execution-started') {
        console.log(`✅ Execution started with ${msg.expressions.length} expressions`);
    }
    else if (msg.type === 'expression-done') {
        const output = msg.output.map(o => `${o.type}: ${o.content.substring(0, 50)}`).join(', ');
        console.log(`✅ Expression done (lines ${msg.lineStart}-${msg.lineEnd}): ${output}`);
    }
    else if (msg.type === 'execution-complete') {
        console.log('✅ Execution complete!');
        console.log('\n🎉 Simplified server works!');
        ws.close();
        process.exit(0);
    }
    else if (msg.type === 'execution-error' || msg.type === 'error') {
        console.log(`❌ Error: ${msg.error}`);
        ws.close();
        process.exit(1);
    }
});

ws.on('error', (error) => {
    console.log(`❌ WebSocket error: ${error.message}`);
    process.exit(1);
});

ws.on('close', () => {
    console.log('🔌 WebSocket closed');
});

// Timeout
setTimeout(() => {
    console.log('❌ Test timeout');
    ws.close();
    process.exit(1);
}, 10000);

#!/usr/bin/env node
/**
 * Test interrupt functionality
 */

import { WebSocket } from 'ws';

console.log('🧪 Testing interrupt functionality...\n');

const ws = new WebSocket('ws://127.0.0.1:8889/ws/execute');

let executionId;

ws.on('open', () => {
    console.log('✅ WebSocket connected');

    // Send init
    const sessionId = crypto.randomUUID();
    ws.send(JSON.stringify({ type: 'init', sessionId }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'init-ack') {
        console.log('✅ Session initialized\n');

        // Send long-running execution
        executionId = crypto.randomUUID();
        console.log('📤 Starting infinite loop...');
        ws.send(JSON.stringify({
            type: 'execute',
            executionId,
            script: `import time
for i in range(1000):
    print(f"Iteration {i}")
    time.sleep(0.1)`,
            scriptName: 'test.py'
        }));

        // Send interrupt after 1 second
        setTimeout(() => {
            console.log('\n⚡ Sending interrupt...');
            ws.send(JSON.stringify({ type: 'interrupt' }));
        }, 1000);
    }
    else if (msg.type === 'execution-started') {
        console.log('✅ Execution started');
    }
    else if (msg.type === 'expression-done') {
        // Show first few iterations
        const output = msg.output.map(o => o.content.substring(0, 30)).join('');
        if (output) console.log(`  ${output}`);
    }
    else if (msg.type === 'interrupt-ack') {
        console.log('✅ Interrupt acknowledged - frontend can clean up now');
    }
    else if (msg.type === 'execution-cancelled') {
        console.log('✅ Execution was cancelled!');
        console.log('🎉 Interrupt works!');
        ws.close();
        process.exit(0);
    }
    else if (msg.type === 'execution-complete') {
        console.log('\n❌ Execution completed (should have been interrupted)');
        ws.close();
        process.exit(1);
    }
});

ws.on('error', (error) => {
    console.log(`❌ WebSocket error: ${error.message}`);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.log('❌ Test timeout');
    ws.close();
    process.exit(1);
}, 10000);

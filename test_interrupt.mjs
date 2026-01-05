#!/usr/bin/env node
/**
 * Test interrupt functionality
 */

import { WebSocket } from 'ws';

console.log('🧪 Testing interrupt functionality...\n');

const ws = new WebSocket('ws://127.0.0.1:8889/ws/execute');

let executionId;
let secondExecutionId;

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
        // Check for KeyboardInterrupt error
        const hasInterruptError = msg.output && msg.output.some(o =>
            o.type === 'error' && o.content.includes('KeyboardInterrupt')
        );

        if (hasInterruptError) {
            console.log('✅ Received KeyboardInterrupt error from kernel');

            // Now try executing new code after interrupt
            console.log('\n📤 Testing execution after interrupt...');
            secondExecutionId = crypto.randomUUID();
            ws.send(JSON.stringify({
                type: 'execute',
                executionId: secondExecutionId,
                script: '2 + 2',
                scriptName: 'test2.py'
            }));
        } else {
            // Show iterations
            const output = msg.output && msg.output.map(o => o.content.substring(0, 30)).join('');
            if (output) console.log(`  ${output}`);
        }
    }
    else if (msg.type === 'execution-complete') {
        if (msg.executionId === secondExecutionId) {
            console.log('✅ Second execution completed successfully!');
            console.log('\n🎉 SUCCESS: Interrupt works correctly with IPython kernel!');
            ws.close();
            process.exit(0);
        }
        // First execution completes with KeyboardInterrupt - that's expected
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

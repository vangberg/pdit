#!/usr/bin/env node
/**
 * Test the actual frontend by simulating browser WebSocket behavior
 */

import { WebSocket } from 'ws';

console.log('🧪 Testing pdit WebSocket frontend...\n');

// Test 1: Check if page loads
console.log('📄 Test 1: Checking if frontend page loads...');
const response = await fetch('http://127.0.0.1:8888?script=test.py');
if (response.ok) {
    console.log('✅ Frontend page loaded successfully');
    const html = await response.text();
    if (html.includes('<!DOCTYPE html>')) {
        console.log('✅ HTML content detected');
    }
} else {
    console.log('❌ Failed to load frontend');
    process.exit(1);
}

// Test 2: WebSocket connection and execution
console.log('\n📡 Test 2: Testing WebSocket execution...');

const ws = new WebSocket('ws://127.0.0.1:8888/ws/execute');

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
            script: 'print("Hello from frontend test!")\nx = 42\nx + 1',
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
        console.log('\n🎉 All tests passed!');
        ws.close();
        process.exit(0);
    }
    else if (msg.type === 'execution-error') {
        console.log(`❌ Execution error: ${msg.error}`);
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

// Timeout after 10 seconds
setTimeout(() => {
    console.log('❌ Test timeout');
    ws.close();
    process.exit(1);
}, 10000);

---
title: Inline Results
description: Understanding how results are displayed
---

## How Results Work

When you execute code in pdit, each statement is run individually. Results are grouped by the source lines that produced them.

## Types of Output

### Return Values

When an expression produces a value, it's displayed inline:

```python
x = 10
x + 5  # Shows: 15
```

### Print Output

Output from `print()` appears as plain text:

```python
print("Hello, world!")  # Shows: Hello, world!
```

### Multiple Outputs

If multiple statements produce output, they're grouped together:

```python
for i in range(3):
    print(i)
# Shows:
# 0
# 1
# 2
```

## Line Grouping

Results are associated with the lines of code that produced them. Multi-line statements (like loops or function definitions) group their output together.

## Streaming

Output streams in real-time as code executes. Long-running operations show progress as they run.

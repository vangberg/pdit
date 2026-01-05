from pdit.kernel_session import KernelStateMachine
from scenarios.utils import ActionDisplay

ksm = KernelStateMachine()

# Execute a simple script - returns actions
actions = ksm.on_execute_script("1\n2\n")
ActionDisplay(actions)

# Simulate kernel sending status:idle for first statement
actions = ksm.on_kernel_message("status", {"execution_state": "idle"})
ActionDisplay(actions)

# Simulate kernel sending status:idle for second statement
actions = ksm.on_kernel_message("status", {"execution_state": "idle"})
ActionDisplay(actions)

# State is now idle again
ksm.state

# Execute with stream output
ksm2 = KernelStateMachine()
actions = ksm2.on_execute_script('print("hello")')
ActionDisplay(actions)

# Simulate stream output from kernel
actions = ksm2.on_kernel_message("stream", {"name": "stdout", "text": "hello\n"})
ActionDisplay(actions)

# Simulate kernel going idle
actions = ksm2.on_kernel_message("status", {"execution_state": "idle"})
ActionDisplay(actions)

# Execute with error
ksm3 = KernelStateMachine()
actions = ksm3.on_execute_script("1/0")
ActionDisplay(actions)

# Simulate error from kernel
actions = ksm3.on_kernel_message("error", {"traceback": ["ZeroDivisionError: division by zero"]})
ActionDisplay(actions)

# Simulate kernel going idle after error
actions = ksm3.on_kernel_message("status", {"execution_state": "idle"})
ActionDisplay(actions)

# Interrupt during execution
ksm4 = KernelStateMachine()
ksm4.on_execute_script("a = 1\nb = 2\nc = 3")
actions = ksm4.on_interrupt()
ActionDisplay(actions)
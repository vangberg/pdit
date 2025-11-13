# Partial line group update

When doing a partial execution, we are currently replacing the entire
set of line groups with a new set computed only from the results of
the partial execution. This means that any line groups and results
from prior executions are lost, even if they are still relevant/unchanged.

## Solution

Do a partial update of line groups. Logic is simple: any line groups
not overlapping with the executed lines remain unchanged. Any line
groups overlapping with executed lines are replaced with newly computed
line groups from the partial execution.

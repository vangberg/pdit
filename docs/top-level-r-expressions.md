# The Ghost Printer Behind Top-level R Expressions

**Yihui Xie** | 2017-06-08

---

## Overview

This post explains the concept of top-level R expressions and implicit printing, which often confuses users when working with ggplot2 and other R packages.

## What is a Top-Level Expression?

A top-level R expression is "usually _implicitly printed_." When you type `1 + 1` in the console and press Enter, R actually executes `print(2)` behind the scenes. This automatic printing is the "ghost printer" referenced in the title.

## How ggplot2 Works

The ggplot2 package implements a `print.ggplot` method. When you create a plot with `ggplot()` at the console level, the plot object isn't rendered until the print method is invoked. This explains why plots appear after pressing Enter.

## When Printing Doesn't Occur

Nested expressions don't trigger automatic printing. Inside `for` loops, `if` statements, or functions, ggplot objects won't display unless explicitly printed with `print()`.

### Invisible Returns

Some R functions return values marked as invisible, preventing automatic printing:

```r
library(ggplot2)
p = ggplot(mpg, aes(cty, hwy)) + geom_point()
```

The assignment operator returns values invisibly, so no plot appears despite this being a top-level expression.

## Making Values Visible

Wrapping expressions in parentheses forces visibility:

```r
(p = ggplot(mpg, aes(cty, hwy)) + geom_point())
```

## Loop Behavior

`for`, `while`, and `repeat` loops always return invisible `NULL`, preventing automatic printing of contained expressions.

## Base R Graphics Difference

Base R graphics functions create plots regardless of expression context—a notable exception to the top-level expression rule.

## The `withVisible()` Function

This utility reveals whether expressions return visible or invisible values:

```r
withVisible(1 + 1)
withVisible({x = 1 + 1})
```

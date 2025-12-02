# Dataframe Table

Pandas and Polars dataframes should be rendered as interactive tables.

## Implementation

1. Detect if the result of a statement is a Pandas or Polars dataframe.
2. Serialize the dataframe as JSON. Handle types such as datetime, categorical, and missing values appropriately.
3. Use TanStack Table to render the dataframe as an interactive table in the frontend.

## Out of scope

- Filtering, sorting, pagination.
- Fancy styling. Keep it basic.

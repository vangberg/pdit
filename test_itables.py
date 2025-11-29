"""
Test script for ITable anywidget integration.

This script demonstrates using ITable to render dataframes as interactive widgets in Rdit.
"""

import pandas as pd
from itables.widget import ITable

# Test 1: Simple DataFrame
print("Test 1: Simple DataFrame")
df_simple = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
    'Age': [25, 30, 35, 28, 32],
    'City': ['NYC', 'LA', 'SF', 'Chicago', 'Boston'],
    'Salary': [75000, 85000, 95000, 70000, 80000]
})

# This should render as an interactive table widget
ITable(df_simple)

# Test 2: Larger DataFrame with pagination
print("\nTest 2: Larger DataFrame (100 rows)")
import numpy as np

df_large = pd.DataFrame({
    'ID': range(1, 101),
    'Value_A': np.random.randn(100),
    'Value_B': np.random.randn(100),
    'Category': np.random.choice(['X', 'Y', 'Z'], 100),
    'Status': np.random.choice(['Active', 'Inactive'], 100)
})

# This should show pagination controls
ITable(df_large)

# Test 3: DataFrame with various data types
print("\nTest 3: DataFrame with mixed types")
df_mixed = pd.DataFrame({
    'Integer': [1, 2, 3, 4, 5],
    'Float': [1.1, 2.2, 3.3, 4.4, 5.5],
    'String': ['a', 'b', 'c', 'd', 'e'],
    'Boolean': [True, False, True, False, True],
    'Date': pd.date_range('2024-01-01', periods=5)
})

ITable(df_mixed)

print("\nAll tests complete! Each ITable call above should render as an interactive table widget.")

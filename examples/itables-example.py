from itables.sample_pandas_dfs import get_dict_of_test_dfs
from itables.widget import ITable

df = get_dict_of_test_dfs()["int_float_str"]

table = ITable(df, selected_rows=[0, 2, 5], select=True)
table


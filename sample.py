import polars as pl

# Load iris dataset (150 rows) and repeat to get ~500 rows
df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")
df = pl.concat([df] * 4)  # Repeat 4 times for 600 rows

df

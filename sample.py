import polars as pl
import matplotlib.pyplot as plt

import time

1
if True:
  time.sleep(2)
  print(123)
2

# Load iris dataset (150 rows) and repeat to get ~500 rows
df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")
df = pl.concat([df] * 4)  # Repeat 4 times for 600 rows

df

# Create a matplotlib scatter plot of the iris data
fig, ax = plt.subplots()

# Get unique species for coloring
species_list = df["species"].unique().to_list()
colors = ['red', 'green', 'blue']

for species, color in zip(species_list, colors):
    species_data = df.filter(pl.col("species") == species)
    ax.scatter(
        species_data["sepal_length"],
        species_data["sepal_width"],
        c=color,
        label=species,
        alpha=0.6
    )

ax.set_xlabel("Sepal Length (cm)")
ax.set_ylabel("Sepal Width (cm)")
ax.set_title("Iris Dataset: Sepal Length vs Sepal Width")
ax.legend()
ax.grid(True, alpha=0.3)

fig



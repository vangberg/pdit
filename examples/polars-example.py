import polars as pl
from IPython import get_ipython
import itables
def polars_to_html(df, include=None, exclude=None):
    html = itables.to_html_datatable(df, display_logo_when_loading=False, classes="display nowrap compact")
    return html

ip = get_ipython()
# Attach to the HTML formatter for the actual pl.DataFrame type:
ip.display_formatter.formatters['text/html'].for_type(pl.DataFrame, polars_to_html)

df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")
with open("p.html", "w") as f:
  f.write(polars_to_html(df))
df
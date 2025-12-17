from plotnine import ggplot, aes, geom_point, geom_smooth, labs, theme_minimal
from plotnine.data import mtcars

# Basic scatter plot with trend line
(
    ggplot(mtcars, aes(x='wt', y='mpg', color='factor(cyl)'))
    + geom_point(size=3)
    + geom_smooth(method='lm', se=False)
    + labs(
        title='Car Weight vs MPG',
        x='Weight (1000 lbs)',
        y='Miles per Gallon',
        color='Cylinders'
    )
    + theme_minimal()
)

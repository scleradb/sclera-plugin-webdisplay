# Sclera - Web Display

Enables users to plot query results in a web-browser. This enables a richer, more visual experience with extensive support for data visualization.

Specifically, you can use a very expressive graphics language to plot the results of a query as regular, multilayered and faceted graphs in just a few lines of code. The graph specification language is inspired by the "Grammar of Graphics" (implemented in `R` as [ggplot2](http://ggplot2.org)), and is rendered using [D3](http://d3js.org) in [SVG](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics).

Unlike `ggplot2`, the resulting plots are interactive, and can display streaming data in a continuous manner. Moreover, the specification language is well-integrated with [ScleraSQL](https://scleradb.com/docs/sclerasql/sqlintro/).

For details and examples on using these constructs, please refer to the [ScleraSQL Visualization Reference](https://scleradb.com/docs/sclerasql/visualization/) document. A live demonstration of the supported visualizations and the corresponding ScleraSQL code is available at the [ScleraViz website](https://scleraviz.herokuapp.com).

/**
* Sclera - Web Display
* Copyright 2012 - 2020 Sclera, Inc.
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
* 
*     http://www.apache.org/licenses/LICENSE-2.0
* 
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

const sclera = { "version": "1.0" };

sclera.addText = function(html) {
    d3.select("#display")
        .append("div").attr("class", "sclera-html col-6 col-12").html(html);
}

sclera.addCard = function(renderer, title) {
    const card = d3.select("#display")
        .append("div").attr("class", "card col-6 col-12");

    const cardBody = card.append("div").attr("class", "card-body")
        .call(renderer.render);

    if( title ) {
       cardBody.append("p").attr("class", "card-title").text(title);
    }

    return renderer;
};

sclera.facetedplot = function(
    name, layout, trans, axisSpecs, facetSpecs, subPlotSpecs
) {
    sclera.legends.clear();

    const facetedPlot = {};

    // div to include the facetedPlot
    const div = d3.select(document.createElement("div"))
        .attr("class", "plot");

    const viewBox = {
        width: layout.display.width +
               layout.display.legend.padding + layout.display.legend.width +
               layout.display.margin.left + layout.display.margin.right,
        height: layout.display.height +
                layout.display.margin.top + layout.display.margin.bottom
    };

    // add the graph canvas to the div
    const container = div.append("div")
        .append("svg")
        .attr("id", name)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("viewBox", "0 0 " + viewBox.width + " " + viewBox.height);

    container.append("style").html(sclera.style(name, layout.coord.aes));

    const svg = container
        .append("g")
        .attr("transform",
              "translate(" + layout.display.margin.left + "," +
                             layout.display.margin.top + ")");

    const svgdefs = svg.append("defs");

    svgdefs.append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", layout.display.width)
        .attr("height", layout.display.height);

    svgdefs.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 1)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,0L10,5L0,10Z");

    // add the tooltip area to the webpage
    const tooltipSvg = div.append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    const legendSvg = container
        .append("g")
        .attr("class", "legend")
        .attr("transform",
              "translate(" + (layout.display.margin.left +
                              layout.display.width +
                              layout.display.legend.padding) +
                             "," + layout.display.margin.top + ")");

    // facet
    const facet = sclera.facet(facetSpecs);
    const transforms = facet.transforms(
        layout.display.width, layout.display.height
    );

    // all the axes defined across all the subplots
    const axesInfo = {};
    axesInfo.x = d3.map();
    axesInfo.y = d3.map();

    const subPlotAxis = function(attr, n) {
        const axisSpec = axisSpecs[attr][n];

        return function(i, j) {
            const key = axisSpec.isfree ? JSON.stringify([n, i, j]) : n;

            let axisInfo = axesInfo[attr].get(key);
            if( !axisInfo ) {
                axisInfo = {};

                axisInfo.key = key;
                axisInfo.axis = sclera.axis(axisSpec, attr);
                axisInfo.subPlots = [];

                if( axisSpec.isfree ) {
                    const coord = {};
                    coord.row = i;
                    coord.col = j;

                    axisInfo.coord = coord;
                }

                axesInfo[attr].set(key, axisInfo);
            }

            return axisInfo;
        };
    };

    const subPlotInfo = subPlotSpecs.map(function(spec) {
        const info = {};

        info.display = spec.display;

        info.xAxis = subPlotAxis("x", spec.axis.x);
        info.yAxis = subPlotAxis("y", spec.axis.y);

        const configs = d3.map();
        spec.layers.forEach(function(layerSpec) {
            const config = sclera.config(layerSpec.name, layerSpec.config);
            configs.set(layerSpec.name, config);
        });

        const subPlotLayers = d3.map();

        info.layers = function(xAxis, yAxis) {
            const key = JSON.stringify([xAxis.key, yAxis.key]);

            let layers = subPlotLayers.get(key);
            if( !layers ) {
                layers = spec.layers.map(function(layerSpec) {
                    return sclera.layer[layerSpec.type](
                        trans, configs.get(layerSpec.name),
                        xAxis.axis, yAxis.axis
                    );
                });

                subPlotLayers.set(key, layers);
            }

            return layers;
        };

        return info;
    });

    const buildSubPlots = function(subPlotSvg, i, j) {
        return subPlotInfo.map(function(info) {
            const xAxis = info.xAxis(i, j);
            const yAxis = info.yAxis(i, j);
            const layers = info.layers(xAxis, yAxis);

            const subPlot = sclera.subplot(
                subPlotSvg, tooltipSvg, layout.display.legend, info.display,
                trans, xAxis.axis, yAxis.axis, layers
            );

            xAxis.subPlots.push(subPlot);
            yAxis.subPlots.push(subPlot);

            xAxis.axis.reSize(transforms.col.length());
            yAxis.axis.reSize(transforms.row.length());

            return subPlot;
        });
    };

    const rowSvgMap = d3.map();
    const subPlotMap = d3.map();

    const rowLabelSvgs = d3.map();
    const colLabelSvgs = d3.map();

    const drawSubPlots = function() {
        const nest = facet.nest(data);

        // create new rows, if needed
        const facetRows = svg.selectAll(".facetrow")
            .data(nest.keys(), function(i) { return i; });

        let isRowAdded = false;

        facetRows
            .enter()
            .append("g")
            .attr("class", "facetrow")
            .each(function(i) {
                rowSvgMap.set(i, d3.select(this));
                subPlotMap.set(i, d3.map());
                transforms.row.add(i);

                const rowLabel = transforms.col.label;
                if( rowLabel ) {
                    const labelSvg = svg.append("text")
                        .attr("class", "rowlabel")
                        .style("text-anchor", "middle")
                        .text(facet.rowValueString(i));

                    rowLabelSvgs.set(i, labelSvg);
                }

                isRowAdded = true;
            });

        let isColAdded = false;

        nest.entries().forEach(function(rc) {
            const subPlotRow = subPlotMap.get(rc.key);

            // create new columns for the row, if needed
            rowSvgMap.get(rc.key).selectAll(".facetcol")
                .data(rc.value.keys(), function(j) { return j; })
                .enter()
                .append("g")
                .attr("class", "facetcol")
                .each(function(j) {
                    const subPlots = buildSubPlots(d3.select(this), rc.key, j);
                    subPlotRow.set(j, subPlots);

                    const isNewCol = transforms.col.add(j);
                    if( isNewCol ) {
                        const colLabel = transforms.row.label;
                        if( colLabel ) {
                            const labelSvg = svg.append("text")
                                .attr("class", "collabel")
                                .style("text-anchor", "middle")
                                .text(facet.colValueString(j));

                            colLabelSvgs.set(j, labelSvg);
                        }

                        isColAdded = true;
                    }

                    d3.select(this)
                    .attr("transform", function(j) {
                        return "translate(" +
                            transforms.col.translate(j) + "," +
                            transforms.row.offset +
                        ")";
                    });
                });
        });

        if( isRowAdded ) {
            svg.selectAll(".facetrow")
            .attr("transform", function(i) {
                return "translate(" +
                    transforms.col.offset + "," +
                    transforms.row.translate(i) +
                ")";
            });

            const height = transforms.row.length();
            axesInfo.y.values().forEach(function(yAxis) {
                yAxis.axis.reSize(height);
            });

            const rowLabel = transforms.col.label;
            if( rowLabel ) {
                const lx = rowLabel.translate + rowLabel.length/2;

                rowLabelSvgs.entries().forEach(function(kv) {
                    const ly = transforms.row.translate(kv.key) + height/2;

                    kv.value
                    .attr("x", lx)
                    .attr("y", ly)
                    .attr("transform", "rotate(90 " + lx + "," + ly + ")");
                });
            }
        }

        if( isColAdded ) {
            svg.selectAll(".facetcol")
            .attr("transform", function(j) {
                return "translate(" +
                    transforms.col.translate(j) + "," +
                    transforms.row.offset +
                ")";
            });

            const width = transforms.col.length();
            axesInfo.x.values().forEach(function(xAxis) {
                xAxis.axis.reSize(width);
            });

            const colLabel = transforms.row.label;
            if( colLabel ) {
                const ly = colLabel.translate + colLabel.length/2;

                colLabelSvgs.entries().forEach(function(kv) {
                    const lx = transforms.col.translate(kv.key) + width/2;

                    kv.value
                    .attr("x", lx)
                    .attr("y", ly);
                });
            }
        }

        if( isRowAdded || isColAdded ) {
            const width = transforms.col.length();
            const height = transforms.row.length();
            subPlotMap.values().forEach(function(subPlotRow) {
                subPlotRow.values().forEach(function(subPlots) {
                    subPlots.forEach(function(subPlot) {
                        subPlot.reSize(width, height);
                    });
                });
            });
        }

        nest.entries().forEach(function(rc) {
            const subPlotRow = subPlotMap.get(rc.key);
            rc.value.entries().forEach(function(cd) {
                const subPlots = subPlotRow.get(cd.key);
                subPlots.forEach(function(subPlot) { subPlot.draw(cd.value); });
            });
        });

        sclera.legends.draw(
            legendSvg, layout.display.legend.width, layout.display.legend.height
        );

        return (isRowAdded || isColAdded);
    };

    const updateDomain = function() {
        let nest = undefined;

        const update = function(axisInfo) {
            let isScaleChanged = false;

            axisInfo.forEach(function(info) {
                let axisData = undefined;

                if( info.coord === undefined ) {
                    axisData = data;
                } else {
                    if( nest === undefined ) nest = facet.nest(data);
                    axisData = nest.get(info.coord.row).get(info.coord.col);
                }

                const axisLayers = [];
                info.subPlots.forEach(function(subPlot) {
                    subPlot.layers.forEach(function(d) { axisLayers.push(d); });
                });

                const isChanged = info.axis.updateDomain(axisData, axisLayers);

                isScaleChanged = isScaleChanged || isChanged;
            });

            return isScaleChanged;
        };

        const isScaleChangedX = update(axesInfo.x.values());
        const isScaleChangedY = update(axesInfo.y.values());

        return isScaleChangedX || isScaleChangedY;
    };

    const updateSubPlots = function(t, n) {
        subPlotMap.values().forEach(function(subPlotRow) {
            subPlotRow.values().forEach(function(subPlots) {
                subPlots.forEach(function(subPlot) {
                    subPlot.update(t, n);
                });
            });
        });
    };

    const buffer = [];
    const data = [];
    let nRows = 0;

    // add new points to the data array
    const addRows = function() {
        let incrRows = buffer.length;

        axesInfo.x.values().forEach(function(xAxis) {
            if( xAxis.axis.windowsize && incrRows > xAxis.axis.windowsize ) {
                incrRows = xAxis.axis.windowsize;
            }
        });

        axesInfo.y.values().forEach(function(yAxis) {
            if( yAxis.axis.windowsize && incrRows > yAxis.axis.windowsize ) {
                incrRows = yAxis.axis.windowsize;
            }
        });

        if( incrRows < 1 ) incrRows = 1;

        nRows += incrRows;
        while( incrRows-- > 0 ) {
            data.push(buffer.shift());
        }
    };

    // remove points from the data array
    const removeRows = function() {
        axesInfo.x.values().forEach(function(xAxis) {
            if( xAxis.axis.windowsize && data.length > xAxis.axis.windowsize ) {
                data = data.slice(data.length - xAxis.axis.windowsize);
            }
        });

        axesInfo.y.values().forEach(function(yAxis) {
            if( yAxis.axis.windowsize && data.length > yAxis.axis.windowsize ) {
                data = data.slice(data.length - yAxis.axis.windowsize);
            }
        });
    }

    let isTransActivated = false;

    const transition = function() {
        if( buffer.length === 0 ) {
            drawSubPlots();
            isTransActivated = false;
            return;
        }

        isTransActivated = true;

        addRows();
        if( nRows < 2 ) {
            updateDomain();
            transition();
            return;
        }

        const isResized = drawSubPlots();
        removeRows();

        const isScaleChanged = updateDomain();

        const t = svg.transition()
            .duration(trans.duration)
            .ease(trans.ease);

        if( isResized || isScaleChanged ) updateSubPlots(t, nRows);
        t.transition().each("end", transition);
    }

    facetedPlot.update = function(ds) {
        ds.forEach(function(d) { buffer.push(d); });
        if( !isTransActivated ) transition();
    }

    facetedPlot.setColumns = function(columns) {
        facetedPlot.columns = columns;
        facet.initValueString(columns);
    };

    facetedPlot.render = function(resultContainer) {
        resultContainer.append(function() { return div.node(); });
    };

    return facetedPlot;
};

sclera.subplot = function(
    parentSvg, tooltipSvg, legend,
    display, trans, xAxis, yAxis, layers
) {
    const subplot = {};
    subplot.width = 1;
    subplot.height = 1;

    const svg = parentSvg.append("g").attr("class", "subplot")
        .attr("transform", "translate(" +
            (subplot.width * display.x) + ", " + (subplot.height * display.y) +
        ")");

    const yAxisLine = svg.append("g")
        .attr("class", "y axis")
        .call(yAxis.render, subplot.width * display.width);
    yAxisLine.append("text")
        .attr("class", "label")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(yAxis.label || "");

    const xAxisLine = svg.append("g").attr("class", "x axis")
        .attr("transform", "translate(0, " +
            (subplot.height * display.height) +
        ")")
        .call(xAxis.render);
    xAxisLine.append("text")
        .attr("class", "label")
        .attr("x", subplot.width * display.width)
        .attr("y", -6)
        .style("text-anchor", "end")
        .text(xAxis.label || "");

    // setup layers
    const layerSvg = layers.map(function(layer) { return layer.setup(svg); });

    subplot.layers = layers;
    
    subplot.draw = function(data) {
        subplot.layers.forEach(function(layer, i) {
            const prepared = layer.prepareData(data);
            if( prepared.length > 0 )
                layer.draw(prepared, layerSvg[i], tooltipSvg);
        });
    };

    subplot.update = function(t, nRows) {
        subplot.layers.forEach(function(layer, i) {
            const tlayer = t.select(function() { return layerSvg[i].node(); });
            layer.update(tlayer, nRows);
        });

        t.select(function() { return yAxisLine.node(); })
            .call(yAxis.render, subplot.width * display.width);
        t.select(function() { return xAxisLine.node(); })
            .call(xAxis.render);
    };

    subplot.reSize = function(width, height) {
        subplot.width = width;
        subplot.height = height;

        svg.attr("transform", "translate(" +
            (width * display.x) + ", " + (height * display.y) +
        ")")
        .selectAll(".x.axis")
        .attr("transform", "translate(0," + (height * display.height) + ")")
        .selectAll(".label")
        .attr("x", width * display.width);

        svg.select(function() { return yAxisLine.node(); })
            .call(yAxis.render, width * display.width);
        svg.select(function() { return xAxisLine.node(); })
            .call(xAxis.render);
    };

    return subplot;
};

sclera.axis = function(spec, attr) {
    const axis = {};

    let plotLength = 1;

    axis.label = spec.label;
    axis.windowsize = spec.windowsize;

    let needDispDist = false;

    axis.enableDispDist = function() {
        needDispDist = true;
    };

    let outerPadding = 0;
    axis.setOuterPadding = function(v) {
        if( v !== undefined ) outerPadding = v;
    };

    let minDispDist = undefined;
    axis.minDispDist = function() {
        if( minDispDist === undefined ) return 1;
        return minDispDist;
    };

    axis.orient = spec.orient;

    axis.length = function() { return spec.length * plotLength; };

    if( ["top", "bottom"].indexOf(axis.orient) >= 0 ) {
        axis.range = function() { return [0, axis.length()]; };
    } else {
        axis.range = function() { return [axis.length(), 0]; };
    }

    axis.scaleType = spec.scale.type;

    axis.scale = sclera.scale(spec);

    if( spec.scale.type === "ordinal" ) {
        axis.scale.rangeRoundBands(axis.range());

        // spec.isincreasing does not make sense for ordinal domains
        // TODO: Optimize for spec.iszoomin
        axis.updateDomain = function(data, layers) {
            axis.scale.rangeRoundBands(axis.range());

            axis.prevDomain = axis.scale.domain();

            const index = d3.map();

            layers.forEach(function(layer) {
                if( layer.dataValRange === undefined ) return;
                const valRange = layer.dataValRange[attr];
                if( valRange === undefined ) return;

                data.forEach(function(d, i) {
                    if( !layer.isValidRow(d) ) return;

                    valRange(d).forEach(function(v) {
                        if( !index.has(v) ) {
                            index.set(v, { val: v, pos: i });
                        }
                    });
                });
            });

            const dom = index.values()
                .sort(function(a, b) { return a.pos - b.pos })
                .map(function(a) { return a.val });

            axis.scale.domain(dom);

            if( needDispDist ) {
                if( dom.length < 2 ) {
                    minDispDist = axis.length()/(dom.length + 1);
                } else {
                    minDispDist = axis.scale.rangeBand();
                }
            }

            return true;
        }
    } else {
        axis.scale.range(axis.range());

        const updateDomain = function(data, layers) {
            axis.scale.range(axis.range());

            axis.prevDomain = axis.scale.domain().slice();

            const prev = axis.prevDomain.map(sclera.util.value);

            if( spec.scale.min !== undefined && spec.scale.max !== undefined ) {
                if( prev[0] === spec.scale.min && prev[1] === spec.scale.map ) {
                    return false;
                }

                axis.scale.domain([spec.scale.min, spec.scale.max]);
                return true;
            }

            if( layers.length === 0 ||
                    data === undefined || data.length === 0 ) {
                return false;
            }

            const next = spec.iszoomin ?
                [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] : // reset
                prev.slice(); // refine the previous domain

            layers.forEach(function(layer) {
                if( layer.dataValRange === undefined ) return;
                const valRange = layer.dataValRange[attr];
                if( valRange === undefined ) return;

                if( spec.isincreasing ) {
                    // shortcut
                    let m = 0;
                    while( m < data.length && !layer.isValidRow(data[m]) ) m++;
                    let n = data.length - 1;
                    while( n >= m && !layer.isValidRow(data[n]) ) n--;
                    if( m <= n ) {
                        const vm = valRange(data[m]);
                        const vn = valRange(data[n]);

                        next[0] = Math.min(next[0], vm[0]);
                        next[1] = Math.max(next[1], vn[1]);
                    }
                } else {
                    data.forEach(function(d) {
                        if( !layer.isValidRow(d) ) return;
                        const v = valRange(d);

                        next[0] = Math.min(next[0], v[0]);
                        next[1] = Math.max(next[1], v[1]);
                    });
                }
            });

            if( spec.scale.min !== undefined ) next[0] = spec.scale.min;
            if( spec.scale.max !== undefined ) next[1] = spec.scale.max;

            if( prev[0] === next[0] && prev[1] === next[1] ) {
                return false;
            }

            if( next[0] > next[1] ) { // none of the layers updated the range
                return false;
            }

            axis.scale.domain(next);

            return true;
        };

        axis.updateDomain = function(data, layers) {
            const isChanged = updateDomain(data, layers);
            let minDispVals = undefined;

            if( needDispDist && (isChanged || (minDispDist === undefined)) ) {
                minDispDist = minDispDist || axis.length();

                layers.forEach(function(layer) {
                    if( layer.dataValRange === undefined ) return;
                    const valRange = layer.dataValRange[attr];
                    if( valRange === undefined ) return;

                    let prev = undefined;
                    let prevDisp = undefined;
                    data.forEach(function(d) {
                        if( !layer.isValidRow(d) ) return;

                        const next = valRange(d)[0];
                        const nextDisp = Math.max(0, axis.scale(next));

                        if( prevDisp !== undefined && nextDisp > prevDisp ) {
                            const dispDist = nextDisp - prevDisp;
                            if( dispDist < minDispDist ) {
                                minDispDist = dispDist;
                                minDispVals = [prev, next];
                            }
                        }

                        prev = next;
                        prevDisp = nextDisp;
                    });
                });

                if( minDispVals !== undefined ) {
                    const adj = (minDispVals[1] - minDispVals[0])/2;
                    const dom = axis.scale.domain().map(sclera.util.value);

                    axis.scale.domain([dom[0] - adj, dom[1] + adj]);
                    minDispDist =
                        axis.scale(minDispVals[1]) - axis.scale(minDispVals[0]);
                }
            }

            if( minDispVals === undefined && outerPadding > 0 ) {
                const dom = axis.scale.domain().map(sclera.util.value);
                const spread = dom[1] - dom[0];
                const uadj = outerPadding * spread;
                const ladj = Math.min(Math.abs(uadj), Math.abs(dom[0]));

                axis.scale.domain([dom[0] - ladj, dom[1] + uadj]);
            }

            return isChanged;
        };
    }

    axis.dataMap = function(dataVal, offset) {
        if( offset === undefined ) {
            const dataMap = sclera.util.dataMap(dataVal, axis.scale);

            if( axis.scaleType === "ordinal" ) {
                needDispDist = true;

                return function(d) {
                    const dm = dataMap(d) || 0;
                    return Math.round(dm + axis.minDispDist() * 0.5);
                };
            } else {
                return function(d) { return dataMap(d) || 0; };
            }
        } else if( offset.isRelative ) {
            needDispDist = true;

            const dataMap = sclera.util.dataMap(dataVal, axis.scale);
            if( axis.scaleType === "ordinal" ) {
                return function(d) {
                    const dm = dataMap(d) || 0;
                    return Math.round(
                        dm + axis.minDispDist() * offset.dataVal(d)
                    );
                };
            } else {
                return function(d) {
                    const dm = dataMap(d) || 0;
                    return Math.round(
                        dm + axis.minDispDist() * (offset.dataVal(d) - 0.5)
                    );
                };
            }
        } else { // absolute offset
            const adjDataVal =
                function(d) { return dataVal(d) + offset.dataVal(d); };

            const dataMap = sclera.util.dataMap(adjDataVal, axis.scale);
            return function(d) { return dataMap(d) || 0; };
        }
    }

    const renderer = d3.svg.axis()
        .scale(axis.scale)
        .orient(spec.orient);

    if( spec.tickformat ) {
        const format =
            (spec.scale.type === "time") ? d3.time.format : d3.format;
        renderer.tickFormat(format(spec.tickformat));
    }

    axis.render = function(svg, breadth) {
        if( spec.ticks ) {
            renderer.ticks(spec.ticks);
        } else if( axis.length() < 100 ||
                   (spec.scale.type === "time" && axis.length() < 200) ) {
            renderer.ticks(3);
        } else {
            renderer.ticks(10);
        }

        renderer.innerTickSize(-breadth || 0);
        if( axis.scale.domain().length > 0 ) svg.call(renderer);
    };

    axis.reSize = function(l) {
        plotLength = l;

        if( spec.scale.type === "ordinal" ) {
            axis.scale.rangeRoundBands(axis.range());
        } else {
            axis.scale.range(axis.range());
        }
    };

    return axis;
};

sclera.layer = {};

sclera.layer.point = function(trans, config, xAxis, yAxis) {
    const chart = {};

    xAxis.setOuterPadding(0.05);
    yAxis.setOuterPadding(0.05);

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const size = config.aes.dataMap("size");
    const shape = config.aes.dataMap("shape");
    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    const dotTransform = function(d) {
        const dx = xMap(d) || 0;
        const dy = yMap(d) || 0;
        return "translate(" + dx + "," + dy + ")";
    };

    const symbol = function(d) { return shape(d).size(size(d))(); }

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        },
        y: function(d) {
            const v = config.geom.adjDataVal(yValue, yOffset)(d);
            return [v, v];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const dots = svg.selectAll(".dot")
            .data(data, config.key);

        const entered = dots.enter()
            .append("path")
            .attr("class", "dot")
            .attr("transform", dotTransform)
            .attr("d", symbol)
            .style("fill", fill)
            .style("fill-opacity", alpha)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        dots.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .dot")
            .attr("transform", dotTransform);
    };

    return chart;
};

sclera.layer.line = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    const groupValue = config.groupValue;
    if( groupValue === undefined ) {
        const stackIndex = config.geom.offset("stackindex");
        if( stackIndex !== undefined ) groupValue = stackIndex.dataVal;
    }

    const isClosed = config.geom.dataVal("isclosed");
    const isArea = config.geom.dataVal("isarea");

    const fill = config.aes.dataMap("fill");

    let shape = undefined;
    if( isArea && isArea() ) {
        const yMinVal = function() { return 0; };
        const yMinMap = yAxis.dataMap(yMinVal, yOffset);
        const y0Map = function(d) {
            return Math.min(yAxis.length(), yMinMap(d));
        };

        shape = d3.svg.area()
            .interpolate(config.aes.dataVal("interpolate")())
            .tension(config.aes.dataVal("tension")())
            .x(xMap)
            .y0(y0Map)
            .y1(yMap);
    } else {
        const lineGen = d3.svg.line()
            .interpolate(config.aes.dataVal("interpolate")())
            .tension(config.aes.dataVal("tension")())
            .x(xMap)
            .y(yMap);

        shape = function(d) {
            return lineGen(d) + ((isClosed && isClosed()) ? "Z" : "");
        };
    }

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        },
        y: function(d) {
            const v = config.geom.adjDataVal(yValue, yOffset)(d);
            return [v, v];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const nest = (groupValue === undefined) ?
            [{ key: 1, values: data }] :
            d3.nest().key(groupValue).entries(data);

        const lines = svg.selectAll(".line")
            .data(nest, function(e) { return e.key; });

        const entered = lines.enter()
            .append("path")
            .attr("class", "line")
            .style("fill", function(e) { return fill(e.values[0]); })
            .style("fill-opacity", function(e) { return alpha(e.values[0]); })
            .style("stroke", function(e) { return stroke(e.values[0]); })
            .style("stroke-dasharray",
                   function(e) { return strokeDashArray(e.values[0]); })
            .style("stroke-width",
                   function(e) { return strokeWidth(e.values[0]); })
            .style("stroke-opacity",
                   function(e) { return alpha(e.values[0]); });

        lines
            .attr("d", function(e) { return shape(e.values); })
            .attr("transform", null);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg,
            function(d) { return config.tooltip(d.values[0]); },
            trans.tooltip, entered
        );

        lines.exit().remove();
    };

    chart.update = function(t, nRows) {
        const xDom = xAxis.prevDomain;
        if( xDom === undefined || xDom.length < 2 ) return;

        const xUpdDom = xAxis.scale.domain();

        const prevX = xAxis.scale(xUpdDom[1]);
        const endX = xAxis.scale(xDom[1]);

        let translateX = 0, scaleX = 1.0;

        if( xAxis.windowsize && nRows > xAxis.windowsize ) {
            translateX = endX - prevX;
        } else if( prevX != 0 ) {
            scaleX = endX / prevX;
        }

        const yDom = yAxis.prevDomain;
        if( yDom === undefined || yDom.length < 2 ) return;

        const yUpdDom = yAxis.scale.domain();

        let translateY = 0, scaleY = 1.0;

        const prevY = yAxis.scale(yUpdDom[0]);
        const endY = yAxis.scale(yDom[0]);

        if( yAxis.windowsize && nRows > yAxis.windowsize ) {
            translateY = endY - prevY;
        } else if( prevY != 0 ) {
            scaleY = endY / prevY;
        }

        const transform = [];
        if( translateX !== 0 || translateY !== 0 ) {
            transform.push(
                "translate(" + translateX + ", " + translateY + ")"
            );
        }
        if( scaleX !== 1.0 || scaleY !== 1.0 ) {
            transform.push("scale(" + scaleX + ", " + scaleY + ")");
        }

        if( transform.length > 0 ) {
            const transformStr = transform.join(" ");

            t.selectAll("." + chart.name + " .line")
                .attr("transform", transformStr);
        }
    };

    return chart;
};

sclera.layer.pointrangey = function(trans, config, xAxis, yAxis) {
    const chart = {};

    xAxis.setOuterPadding(0.05);

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const size = config.aes.dataMap("size");
    const shape = config.aes.dataMap("shape");
    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    const yMinValue = config.geom.dataVal("ymin");
    const yMinMap = yAxis.dataMap(yMinValue, yOffset);

    const yMaxValue = config.geom.dataVal("ymax");
    const yMaxMap = yAxis.dataMap(yMaxValue, yOffset);

    const dotTransform = function(d) {
        const dx = xMap(d) || 0;
        const dy = yMap(d) || 0;
        return "translate(" + dx + "," + dy + ")";
    };

    const line = d3.svg.line()
        .interpolate("linear");

    const rangeLine = function(d) {
        const x = xMap(d);
        const yMin = yMinMap(d);
        const yMax = yMaxMap(d);
        return line([[x, yMin], [x, yMax]]);
    };

    const symbol = function(d) { return shape(d).size(size(d))(); }

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        },
        y: function(d) {
            const vmin = config.geom.adjDataVal(yMinValue, yOffset)(d);
            const vmax = config.geom.adjDataVal(yMaxValue, yOffset)(d);
            return [vmin, vmax];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const dotRanges = svg.selectAll(".pointrangey")
            .data(data, config.key);

        const entered = dotRanges.enter()
            .append("g")
            .attr("class", "pointrangey");

        entered
            .append("path")
            .attr("class", "dot")
            .attr("transform", dotTransform)
            .attr("d", symbol)
            .style("fill", fill)
            .style("fill-opacity", alpha)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth);

        entered
            .append("path")
            .attr("class", "range")
            .attr("d", rangeLine)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        dotRanges.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .dot")
            .attr("transform", dotTransform);

        t.selectAll("." + chart.name + " .range")
            .attr("d", rangeLine);
    };

    return chart;
};

sclera.layer.rangey = function(trans, config, xAxis, yAxis) {
    const chart = {};

    xAxis.setOuterPadding(0.05);

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const widthValue = config.geom.dataVal("width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    let xMinValue = undefined, xMinMap = undefined;
    let xMaxValue = undefined, xMaxMap = undefined;
    if( widthValue === undefined ) {
        xMinValue = xValue;
        xMinMap = xMap;
        xMaxValue = xValue;
        xMaxMap = xMap;
    } else {
        xMinValue = function(d) { return xValue(d) - widthValue(d); };
        xMinMap = xAxis.dataMap(xMinValue, xOffset);
        xMaxValue = function(d) { return xValue(d) + widthValue(d); };
        xMaxMap = xAxis.dataMap(xMaxValue, xOffset);
    }

    const yMinValue = config.geom.dataVal("ymin");
    const yOffset = config.geom.offset("ymin");
    const yMinMap = yAxis.dataMap(yMinValue, yOffset);

    const yMaxValue = config.geom.dataVal("ymax");
    const yMaxMap = yAxis.dataMap(yMaxValue, yOffset);

    const line = d3.svg.line()
        .interpolate("linear");

    const rangeLine = function(d) {
        const x = xMap(d);
        const xMin = xMinMap(d);
        const xMax = xMaxMap(d);
        const yMin = yMinMap(d);
        const yMax = yMaxMap(d);

        const range = [[x, yMin], [x, yMax]];

        if( xMin === xMax ) {
            return line(range);
        }

        const topWhisker = [[xMin, yMax], [xMax, yMax]];
        const bottomWhisker = [[xMin, yMin], [xMax, yMin]];

        return line(topWhisker) + line(range) + line(bottomWhisker);
    };

    chart.dataValRange = {
        x: function(d) {
            const vmin = config.geom.adjDataVal(xMinValue, xOffset)(d);
            const vmax = config.geom.adjDataVal(xMaxValue, xOffset)(d);
            return [vmin, vmax];
        },
        y: function(d) {
            const vmin = config.geom.adjDataVal(yMinValue, yOffset)(d);
            const vmax = config.geom.adjDataVal(yMaxValue, yOffset)(d);
            return [vmin, vmax];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const ranges = svg.selectAll(".rangey")
            .data(data, config.key);

        const entered = ranges.enter()
            .append("path")
            .attr("class", "rangey")
            .attr("d", rangeLine)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        ranges.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .rangey")
            .attr("d", rangeLine);
    };

    return chart;
};

sclera.layer.rangex = function(trans, config, xAxis, yAxis) {
    const chart = {};

    yAxis.setOuterPadding(0.05);

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const heightValue = config.geom.dataVal("height");

    const xMinValue = config.geom.dataVal("xmin");
    const xOffset = config.geom.offset("xmin");
    const xMinMap = xAxis.dataMap(xMinValue, xOffset);

    const xMaxValue = config.geom.dataVal("xmax");
    const xMaxMap = xAxis.dataMap(xMaxValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    let yMinValue = undefined, yMinMap = undefined;
    let yMaxValue = undefined, yMaxMap = undefined;
    if( heightValue === undefined ) {
        yMinValue = yValue;
        yMinMap = yMap;
        yMaxValue = yValue;
        yMaxMap = yMap;
    } else {
        yMinValue = function(d) { return yValue(d) - heightValue(d); };
        yMinMap = yAxis.dataMap(yMinValue, yOffset);
        yMaxValue = function(d) { return yValue(d) + heightValue(d); };
        yMaxMap = yAxis.dataMap(yMaxValue, yOffset);
    }

    const line = d3.svg.line()
        .interpolate("linear");

    const rangeLine = function(d) {
        const xMin = xMinMap(d);
        const xMax = xMaxMap(d);
        const yMin = yMinMap(d);
        const yMax = yMaxMap(d);
        const y = yMap(d);

        const range = [[xMin, y], [xMax, y]];

        if( yMin === yMax ) {
            return line(range);
        }

        const leftWhisker = [[xMin, yMin], [xMin, yMax]];
        const rightWhisker = [[xMax, yMin], [xMax, yMax]];

        return line(leftWhisker) + line(range) + line(rightWhisker);
    };

    chart.dataValRange = {
        x: function(d) {
            const vmin = config.geom.adjDataVal(xMinValue, xOffset)(d);
            const vmax = config.geom.adjDataVal(xMaxValue, xOffset)(d);
            return [vmin, vmax];
        },
        y: function(d) {
            const vmin = config.geom.adjDataVal(yMinValue, yOffset)(d);
            const vmax = config.geom.adjDataVal(yMaxValue, yOffset)(d);
            return [vmin, vmax];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const ranges = svg.selectAll(".rangex")
            .data(data, config.key);

        const entered = ranges.enter()
            .append("path")
            .attr("class", "rangex")
            .attr("d", rangeLine)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        ranges.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .rangex")
            .attr("d", rangeLine);
    };

    return chart;
};

sclera.layer.ribbon = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const groupValue = config.groupValue;

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const yMinValue = config.geom.dataVal("ymin");
    const yOffset = config.geom.offset("ymin");
    const yMinMap = yAxis.dataMap(yMinValue, yOffset);

    const yMaxValue = config.geom.dataVal("ymax");
    const yMaxMap = yAxis.dataMap(yMaxValue, yOffset);

    const area = d3.svg.area()
        .interpolate(config.aes.dataVal("interpolate")())
        .tension(config.aes.dataVal("tension")())
        .x(xMap)
        .y0(yMinMap)
        .y1(yMaxMap);

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        },
        y: function(d) {
            const vmin = config.geom.adjDataVal(yMinValue, yOffset)(d);
            const vmax = config.geom.adjDataVal(yMaxValue, yOffset)(d);
            return [vmin, vmax];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const nest = (groupValue === undefined) ?
            [{ key: 1, values: data }] :
            d3.nest().key(groupValue).entries(data);

        const ribbons = svg.selectAll(".ribbon")
            .data(nest, function(e) { return e.key; });

        const entered = ribbons.enter()
            .append("path")
            .attr("class", "ribbon")
            .style("fill", function(e) { return fill(e.values[0]); })
            .style("fill-opacity", function(e) { return alpha(e.values[0]); })
            .style("stroke", function(e) { return stroke(e.values[0]); })
            .style("stroke-dasharray",
                   function(e) { return strokeDashArray(e.values[0]); })
            .style("stroke-width",
                   function(e) { return strokeWidth(e.values[0]); })
            .style("stroke-opacity",
                   function(e) { return alpha(e.values[0]); });

        ribbons
            .attr("d", function(e) { return area(e.values); })
            .attr("transform", null);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg,
            function(d) { return config.tooltip(d.values[0]); },
            trans.tooltip, entered
        );

        ribbons.exit().remove();
    };

    chart.update = function(t, nRows) {
        const xDom = xAxis.prevDomain;
        if( xDom === undefined || xDom.length < 2 ) return;

        const xUpdDom = xAxis.scale.domain();

        let translateX = 0, scaleX = 1.0;

        const prevX = xAxis.scale(xUpdDom[1]);
        const endX = xAxis.scale(xDom[1]);

        if( xAxis.windowsize && nRows > xAxis.windowsize ) {
            translateX = endX - prevX;
        } else if( prevX != 0 ) {
            scaleX = endX / prevX;
        }

        const yDom = yAxis.prevDomain;
        if( yDom === undefined || yDom.length < 2 ) return;

        const yUpdDom = yAxis.scale.domain();

        let translateY = 0, scaleY = 1.0;

        const prevY = yAxis.scale(yUpdDom[0]);
        const endY = yAxis.scale(yDom[0]);

        if( yAxis.windowsize && nRows > yAxis.windowsize ) {
            translateY = endY - prevY;
        } else if( prevY != 0 ) {
            scaleY = endY / prevY;
        }

        const transform = [];
        if( translateX !== 0 || translateY !== 0 ) {
            transform.push(
                "translate(" + translateX + ", " + translateY + ")"
            );
        }
        if( scaleX !== 1.0 || scaleY !== 1.0 ) {
            transform.push("scale(" + scaleX + ", " + scaleY + ")");
        }

        if( transform.length > 0 ) {
            const transformStr = transform.join(" ");

            t.selectAll("." + chart.name + " .ribbon")
                .attr("transform", transformStr);
        }
    };

    return chart;
};

sclera.layer.abline = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const interceptValue = config.geom.dataVal("intercept");
    const interceptOffset = config.geom.offset("intercept");

    const intercept = (interceptOffset === undefined) ?
        interceptValue :
        function(d) { return interceptValue(d) + interceptOffset(d); };

    const slopeValue = config.geom.dataVal("slope");
    const slopeOffset = config.geom.offset("slope");

    const slope = (slopeOffset === undefined) ?
        slopeValue :
        function(d) { return slopeValue(d) + slopeOffset(d); };

    const line = d3.svg.line()
        .interpolate(config.aes.dataVal("interpolate")())
        .tension(config.aes.dataVal("tension")());

    const abline = function(d) {
        const xRange = d3.extent(xAxis.range());
        const yRange = d3.extent(yAxis.range());

        const a = slope(d);
        const b = intercept(d);

        const boundary = [];

        xAxis.scale.domain().forEach(function(x) {
            let vy = undefined;

            if( a == 0 ) {
                vy = yAxis.scale(b);
            } else {
                if( typeof x !== "number" ) return null;
                vy = yAxis.scale(a * x + b);
            }

            if( yRange[0] <= vy && vy <= yRange[1] ) {
                const vx = xAxis.scale(x);
                boundary.push([vx, vy]);
            }
        });

        if( a != 0 ) {
            yAxis.scale.domain().forEach(function(y) {
                if( typeof y !== "number" ) return null;
                const vx = xAxis.scale((y - b) / a);

                if( xRange[0] <= vx && vx <= xRange[1] ) {
                    const vy = yAxis.scale(y);
                    boundary.push([vx, vy]);
                }
            });
        }

        return line(boundary);
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const lines = svg.selectAll(".abline")
            .data(data, config.key);

        const entered = lines.enter()
            .append("path")
            .attr("class", "abline")
            .attr("d", abline)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        lines.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .abline")
            .attr("d", abline);
    };

    return chart;
};

sclera.layer.vline = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const line = d3.svg.line()
        .interpolate(config.aes.dataVal("interpolate")())
        .tension(config.aes.dataVal("tension")());

    const xRange = d3.extent(xAxis.range());
    const vline = function(d) {
        const x = xMap(d);
        if( x < xRange[0] || xRange[1] < x ) return null;

        const boundary = yAxis.range.map(function(y) { return [x, y]; });
        return line(boundary);
    };

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const lines = svg.selectAll(".vline")
            .data(data, config.key);

        const entered = lines.enter()
            .append("path")
            .attr("class", "vline")
            .attr("d", vline)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        lines.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .vline")
            .attr("d", vline);
    };

    return chart;
};

sclera.layer.segment = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const xValue = config.geom.dataVal("x");
    const xOffset = config.geom.offset("x");
    const xMap = xAxis.dataMap(xValue, xOffset);

    const xEndValue = config.geom.dataVal("xend");
    const xEndMap = xAxis.dataMap(xEndValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    const yEndValue = config.geom.dataVal("yend");
    const yEndMap = yAxis.dataMap(yEndValue, yOffset);

    const isArrow = config.geom.dataVal("isarrow");

    const line = d3.svg.line()
        .interpolate(config.aes.dataVal("interpolate")())
        .tension(config.aes.dataVal("tension")());

    const isInside = function(p, xRange, yRange) {
        const isInRange = function(r, z) { return (r[0] <= z && z <= r[1]); };
        return isInRange(xRange, p[0]) && isInRange(yRange, p[1]);
    };

    const markerEnd = function(d) {
        const xRange = d3.extent(xAxis.range());
        const yRange = d3.extent(yAxis.range());

        if( isArrow(d) && isInside([xEndMap(d), yEndMap(d)], xRange, yRange) )
            return "url(#arrow)";
        return null;
    };

    const segment = function(d) {
        const xRange = d3.extent(xAxis.range());
        const yRange = d3.extent(yAxis.range());

        const clip = function(outp, inp) {
            const trim = function(r, z) {
                if( z < r[0] ) return r[0];
                if( z > r[1] ) return r[1];

                return z;
            };

            if( outp[0] == inp[0] ) return [outp[0], trim(yRange, outp[1])];
            if( outp[1] == inp[1] ) return [trim(xRange, outp[0]), outp[1]];

            const a = (outp[1] - inp[1])/(outp[0] - inp[0]);
            const b = inp[1] - a * inp[0];

            const p = outp.slice();

            p[0] = trim(xRange, p[0]);
            if( p[0] != outp[0] ) p[1] = a * p[0] + b;

            p[1] = trim(yRange, p[1]);
            if( p[1] != outp[1] ) p[0] = (p[1] - b)/a;

            return p;
        };

        const start = [xMap(d), yMap(d)];
        const end = [xEndMap(d), yEndMap(d)];

        const inStart = isInside(start, xRange, yRange);
        const inEnd = isInside(end, xRange, yRange);

        let clipped = undefined;
        if( inStart && inEnd ) {
            clipped = [start, end];
        } else if( inStart ) {
            clipped = [start, clip(end, start)];
        } else if( inEnd ) {
            clipped = [clip(start, end), end];
        } else {
            clipped = [];
        }

        return line(clipped);
    };

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            const vend = config.geom.adjDataVal(xEndValue, xOffset)(d);
            return d3.extent([v, vend]);
        },
        y: function(d) {
            const v = config.geom.adjDataVal(yValue, yOffset)(d);
            const vend = config.geom.adjDataVal(yEndValue, yOffset)(d);
            return d3.extent([v, vend]);
        }
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const lines = svg.selectAll(".segment")
            .data(data, config.key);

        const entered = lines.enter()
            .append("path")
            .attr("class", "segment")
            .attr("d", segment)
            .attr("marker-end", markerEnd)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        lines.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .segment")
            .attr("d", segment)
            .attr("marker-end", markerEnd)
    };

    return chart;
};

sclera.layer.ticker = function(trans, config, xAxis, yAxis) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    const style = config.geom.dataVal("style");

    const width = config.geom.dataVal("width");
    const tsValue = config.geom.dataVal("ts");
    const tsOffset = config.geom.offset("ts");

    const tsLeftValue = function(d) { return tsValue(d) - width(d)/2; }
    const tsRightValue = function(d) { return tsValue(d) + width(d)/2; }

    const tsMap = xAxis.dataMap(tsValue, tsOffset);

    let tsLeftMap = undefined;
    let tsRightMap = undefined;

    if( width === undefined ) {
        tsLeftMap = function(d) { return tsMap(d) - 2; };
        tsRightMap = function(d) { return tsMap(d) + 2; };
    } else {
        tsLeftMap = xAxis.dataMap(tsLeftValue, tsOffset);
        tsRightMap = xAxis.dataMap(tsRightValue, tsOffset);
    }

    const openValue = config.geom.dataVal("open");
    const priceOffset = config.geom.offset("open");
    const openMap = yAxis.dataMap(openValue, priceOffset);

    const highValue = config.geom.dataVal("high");
    const highMap = yAxis.dataMap(highValue, priceOffset);

    const lowValue = config.geom.dataVal("low");
    const lowMap = yAxis.dataMap(lowValue, priceOffset);

    const closeValue = config.geom.dataVal("close");
    const closeMap = yAxis.dataMap(closeValue, priceOffset);

    const line = d3.svg.line();

    const ticker = function(d) {
        const ts = tsMap(d);
        const tsLeft = tsLeftMap(d);
        const tsRight = tsRightMap(d);
        const open = openMap(d);
        const high = highMap(d);
        const low = lowMap(d);
        const close = closeMap(d);

        if( style() === "ohlc" ) {
            const openTick = [[tsLeft, open], [ts, open]];
            const highLow = [[ts, high], [ts, low]];
            const closeTick = [[ts, close], [tsRight, close]];

            return line(openTick) + line(highLow) + line(closeTick);
        }

        if( style() === "candlestick" ) {
            const breaks = d3.extent([open, close]);

            const upper = [[ts, high], [ts, breaks[0]]]; 
            const rect = [
                [tsLeft, breaks[0]],
                [tsRight, breaks[0]],
                [tsRight, breaks[1]],
                [tsLeft, breaks[1]]
            ];
            const lower = [[ts, breaks[1]], [ts, low]];

            return line(upper) + line(lower) + line(rect) + "Z";
        }

        throw "Unknown style: " + style();
    };

    chart.dataValRange = {};

    if( width === undefined ) {
        chart.dataValRange.x = function(d) {
            const v = config.geom.adjDataVal(tsValue, tsOffset)(d);
            return [v, v];
        };
    } else {
        chart.dataValRange.x = function(d) {
            const vLeft = config.geom.adjDataVal(tsLeftValue, tsOffset)(d);
            const vRight = config.geom.adjDataVal(tsRightValue, tsOffset)(d);
            return [vLeft, vRight];
        };
    }

    chart.dataValRange.y = function(d) {
        const vmin = config.geom.adjDataVal(lowValue, priceOffset)(d);
        const vmax = config.geom.adjDataVal(highValue, priceOffset)(d);
        return [vmin, vmax];
    };

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const lines = svg.selectAll(".ticker")
            .data(data, config.key);

        const entered = lines.enter()
            .append("path")
            .attr("class", "ticker")
            .attr("d", ticker)
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth)
            .style("stroke-opacity", alpha);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        lines.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .ticker")
            .attr("d", ticker);
    };

    return chart;
};

sclera.layer.bar = function(trans, config, xAxis, yAxis) {
    xAxis.setOuterPadding(0.05);
    yAxis.setOuterPadding(0.05);

    const xValue = config.geom.dataVal("x");

    let xOffset = config.geom.offset("x");
    let width = undefined;

    if( xOffset ) {
        const barWidth = config.geom.offset("barwidth");
        if( !barWidth ) throw "Bar width not found";

        if( barWidth.isRelative ) {
            xAxis.enableDispDist();

            width = function(d) {
                return barWidth.dataVal(d) * xAxis.minDispDist();
            };
        } else {
            width = barWidth.dataVal;
        }
    } else {
        xAxis.enableDispDist();
        const padding = 0.1;

        xOffset = {};
        xOffset.isRelative = true;
        xOffset.dataVal = function() { return padding/2.0; };

        width = function(d) { return (1.0-padding) * xAxis.minDispDist(d); };
    }

    const xMap = xAxis.dataMap(xValue, xOffset);

    const yValue = config.geom.dataVal("y");
    const yOffset = config.geom.offset("y");
    const yMap = yAxis.dataMap(yValue, yOffset);

    const hMap = yAxis.dataMap(yValue);

    const params = {};

    params.x = xMap;
    params.width = function(d) { return Math.max(1, width(d)); };

    params.y = function(d) { return Math.min(yAxis.scale(0), yMap(d)); };
    params.height = function(d) { return Math.abs(yAxis.scale(0) - hMap(d)); };

    const chart = sclera.layer.rectbar(trans, config, params);

    chart.dataValRange = {
        x: function(d) {
            const v = config.geom.adjDataVal(xValue, xOffset)(d);
            return [v, v];
        },
        y: function(d) {
            const v = config.geom.adjDataVal(yValue, yOffset)(d);
            if( v < 0 ) return [v, 0];
            return [0, v];
        }
    };

    return chart;
};

sclera.layer.rect = function(trans, config, xAxis, yAxis) {
    const xMinValue = config.geom.dataVal("xmin");
    const xMinMap = xAxis.dataMap(xMinValue);

    const xMaxValue = config.geom.dataVal("xmax");
    const xMaxMap = xAxis.dataMap(xMaxValue);

    const yMinValue = config.geom.dataVal("ymin");
    const yMinMap = yAxis.dataMap(yMinValue);

    const yMaxValue = config.geom.dataVal("ymax");
    const yMaxMap = yAxis.dataMap(yMaxValue);

    const params = {};

    params.x = xMinMap;
    params.width = function(d) {
        return Math.max(0, xMaxMap(d) - xMinMap(d));
    };

    params.y = yMaxMap;
    params.height = function(d) {
        return Math.max(0, yMinMap(d) - yMaxMap(d));
    };

    const chart = sclera.layer.rectbar(trans, config, params);

    chart.dataValRange = {
        x: function(d) {
            return [xMinValue(d), xMaxValue(d)];
        },
        y: function(d) {
            return [yMinValue(d), yMaxValue(d)];
        }
    };

    return chart;
}

sclera.layer.regionx = function(trans, config, xAxis, yAxis) {
    const minValue = config.geom.dataVal("min");
    const minMap = xAxis.dataMap(minValue);

    const maxValue = config.geom.dataVal("max");
    const maxMap = xAxis.dataMap(maxValue);

    const beginValue = config.geom.dataVal("begin");
    const beginMap = yAxis.dataMap(beginValue);

    const endValue = config.geom.dataVal("end");
    const endMap = yAxis.dataMap(endValue);

    const params = {};

    params.x = minMap;
    params.width = function(d) { return maxMap(d) - minMap(d); };

    if( beginValue !== undefined && endValue !== undefined ) {
        params.y = endMap;
        params.height = function(d) { return beginMap(d) - endMap(d); };
    } else if( beginValue !== undefined ) {
        params.y = function() { return 0; };
        params.height = beginMap;
    } else if( endValue !== undefined ) {
        params.y = endMap;
        params.height = function(d) { return yAxis.length - endMap(d); };
    } else {
        params.y = function() { return 0; };
        params.height = yAxis.length;
    }

    const chart = sclera.layer.rectbar(trans, config, params);

    chart.dataValRange = {};

    chart.dataValRange.x = function(d) {
        return [minValue(d), maxValue(d)];
    };

    if( beginValue !== undefined && endValue !== undefined ) {
        chart.dataValRange.y = function(d) {
            return [beginValue(d), endValue(d)];
        };
    } else if( beginValue !== undefined ) {
        chart.dataValRange.y = function(d) {
            return [beginValue(d), beginValue(d)];
        };
    } else if( endValue !== undefined ) {
        chart.dataValRange.y = function(d) {
            return [endValue(d), endValue(d)];
        };
    }

    return chart;
};

sclera.layer.regiony = function(trans, config, xAxis, yAxis) {
    const minValue = config.geom.dataVal("min");
    const minMap = yAxis.dataMap(minValue);

    const maxValue = config.geom.dataVal("max");
    const maxMap = yAxis.dataMap(maxValue);

    const beginValue = config.geom.dataVal("begin");
    const beginMap = xAxis.dataMap(beginValue);

    const endValue = config.geom.dataVal("end");
    const endMap = xAxis.dataMap(endValue);

    const params = {};

    if( beginValue !== undefined && endValue !== undefined ) {
        params.x = beginMap;
        params.width = function(d) { return endMap(d) - beginMap(d); };
    } else if( beginValue !== undefined ) {
        params.x = beginMap;
        params.width = function(d) { return xAxis.length() - beginMap(d); };
    } else if( endValue !== undefined ) {
        params.x = function() { return 0; };
        params.width = endMap;
    } else {
        params.x = function() { return 0; };
        params.width = xAxis.length;
    }

    params.y = maxMap;
    params.height = function(d) { return minMap(d) - maxMap(d); };

    const chart = sclera.layer.rectbar(trans, config, params);

    chart.dataValRange = {};

    if( beginValue !== undefined && endValue !== undefined ) {
        chart.dataValRange.x = function(d) {
            return [beginValue(d), endValue(d)];
        };
    } else if( beginValue !== undefined ) {
        chart.dataValRange.x = function(d) {
            return [beginValue(d), beginValue(d)];
        };
    } else if( endValue !== undefined ) {
        chart.dataValRange.x = function(d) {
            return [endValue(d), endValue(d)];
        };
    }

    chart.dataValRange.y = function(d) {
        return [minValue(d), maxValue(d)];
    };

    return chart;
};

sclera.layer.rectbar = function(trans, config, params) {
    const chart = {};

    chart.name = config.name;

    chart.isValidRow = config.geom.isValidRow;
    chart.prepareData = config.prepareData;

    const fill = config.aes.dataMap("fill");
    const alpha = config.aes.dataMap("alpha");
    const stroke = config.aes.dataMap("stroke");
    const strokeDashArray = config.aes.dataMap("stroke-dasharray");
    const strokeWidth = config.aes.dataMap("stroke-width");

    chart.setup = function(svg) {
        return svg.append("g")
            .attr("class", chart.name)
            .attr("clip-path", "url(#clip)");
    };

    chart.draw = function(data, svg, tooltipSvg) {
        const bars = svg.selectAll(".bar")
            .data(data, config.key);

        const entered = bars.enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", function(d) { return params.x(d) || 0; })
            .attr("y", function(d) { return params.y(d) || 0; })
            .attr("width", function(d) { return params.width(d) || 0; })
            .attr("height", function(d) { return params.height(d) || 0; })
            .style("fill", fill)
            .style("fill-opacity", alpha)
            .style("stroke", stroke)
            .style("stroke-dasharray", strokeDashArray)
            .style("stroke-width", strokeWidth);

        if( config.tooltip !== undefined ) sclera.setTooltip(
            tooltipSvg, config.tooltip, trans.tooltip, entered
        );

        bars.exit().remove();
    };

    chart.update = function(t) {
        t.selectAll("." + chart.name + " .bar")
            .attr("x", params.x)
            .attr("y", params.y)
            .attr("width", params.width)
            .attr("height", params.height);
    };

    return chart;
};

sclera.config = function(name, spec) {
    const config = {};

    config.name = name;

    config.groupValue = sclera.util.dataVal(spec.group);

    config.geom = {};

    config.geom.isValidRow = function(d) {
        return d3.values(spec.geom).every(function(a) {
            if( a.index === undefined ) return true;

            const v = d[a.index];
            return (v !== undefined && v !== null);
        });
    };

    config.geom.dataVal = function(attr, defaultValue) {
        return sclera.util.dataVal(spec.geom[attr], defaultValue);
    };

    config.geom.offset = function(attr) {
        if( spec.offset === undefined || spec.offset[attr] === undefined ) {
            return undefined;
        }

        const offset = {};

        offset.dataVal = sclera.util.dataVal(spec.offset[attr]);
        offset.isRelative = spec.offset[attr].isrelative;

        return offset;
    };

    config.geom.adjDataVal = function(dataVal, offset) {
        if( offset === undefined || offset.isRelative ) {
            // no offset or relative offset
            return dataVal;
        } else {
            // absolute offset
            return function(d) { return dataVal(d) + offset.dataVal(d); };
        }
    }

    config.aes = {};

    config.aes.cache = function(f) {
        const cache = {};

        return function(attr) {
            let v = cache[attr];
            if( v === undefined ) {
                v = f(attr);
                cache[attr] = v;
            }

            return v;
        };
    };

    config.aes.dataVal = config.aes.cache(function(attr) {
        return sclera.util.dataVal(spec.aes[attr]);
    });

    config.aes.scale = config.aes.cache(function(attr) {
        const s = spec.aes[attr];
        const scale = sclera.scale(s);
        const onNull = s.onnull;

        if( s.scale !== undefined && s.legend !== undefined ) {
            sclera.legends.setup(scale, s.scale.type, s.legend, attr);
        }

        return function(v) {
            const out = (v === null || v === undefined) ? onNull : scale(v);
            return (attr === "shape") ? d3.svg.symbol().type(out) : out;
        }
    });

    config.aes.dataMap = config.aes.cache(function(attr) {
        return sclera.util.dataMap(
            config.aes.dataVal(attr),
            config.aes.scale(attr)
        );
    });

    config.key = spec.key ? sclera.util.dataVal(spec.key) : JSON.stringify;

    // TODO: Make more efficient by combining the filter, uniq, and sort
    config.prepareData = function(data) {
        const filtered = data.filter(config.geom.isValidRow);
        const uniq = sclera.util.uniq(filtered, config.key);

        return uniq.sort(function(a, b) {
            return a[a.length - 1] - b[b.length - 1];
        });
    };

    config.tooltip = sclera.util.dataVal(spec.tooltip);

    return config;
};

sclera.legends = {};

sclera.legends.info = {};

sclera.legends.clear = function() { sclera.legends.info = {}; };

sclera.legends.reverse = function(scale) {
    const domain = scale.domain().slice();
    domain.reverse();
    const range = scale.range().slice();
    range.reverse();

    scale.domain(domain).range(range);
};

sclera.legends.setup = function(scale, scaleType, legendSpec, attr) {
    if( sclera.legends.info[attr] !== undefined ) return;

    let legend = undefined;
    let legendUpdate = undefined;

    let xOffset = 0;
    let yOffset = 10;
    if( attr === "size" ) {
        legend = d3.legend.symbol();

        xOffset = 5;
        legend.labelOffset(0);

        const symbol = d3.svg.symbol();
        const baseSize = symbol.size();

        // TODO -- not sure why this is done here
        scale.range(
            scale.range().map(function(v) {
                return baseSize() * v;
            })
        );

        symbol.size(function(d) { return d; });

        const legendScale = d3.scale.linear();

        legend.scale(legendScale);
        legendUpdate = function() {
            legendScale
            .domain(scale.domain())
            .range(scale.range().map(symbol));

            if( legendSpec.isreversed ) sclera.legends.reverse(legendScale);
        };
    } else if( attr === "shape" ) {
        legend = d3.legend.symbol();

        xOffset = 5;
        yOffset = 15;
        legend.labelOffset(0);

        const legendScale = d3.scale.ordinal();

        legend.scale(legendScale);
        legendUpdate = function() {
            const nshapes = scale.domain().length;
            legendScale
            .domain(scale.domain())
            .range(scale.range().slice(0, nshapes).map(function(s) {
                return d3.svg.symbol().type(s)();
            }));

            if( legendSpec.isreversed ) sclera.legends.reverse(legendScale);
        };
    } else if( attr === "alpha" ) {
        legend = d3.legend.color().cells(5);
        xOffset = 0;

        const legendScale = d3.scale.linear().range(["white", "black"]);

        legend.scale(legendScale);
        legendUpdate = function() {
            legendScale
            .domain(scale.domain());

            if( legendSpec.isreversed ) sclera.legends.reverse(legendScale);
        };
    } else {
        legend = d3.legend.color();
        xOffset = 0;

        const legendScale = scale.copy();

        legend.scale(legendScale);
        legendUpdate = function() {
            legendScale
            .domain(scale.domain())
            .range(scale.range().slice(0, scale.domain().length));

            if( legendSpec.isreversed ) sclera.legends.reverse(legendScale);
        };
    }

    if( legendSpec.orient ) {
        legend.orient(legendSpec.orient.type);
        legend.labelAlign(legendSpec.orient.align);
    }

    let setLabels = undefined;
    if( legendSpec.labels ) {
        if( legendSpec.labels.list ) {
            legend.labels(legendSpec.labels.list);
        } else if( legendSpec.labels.map ) {
            const labelMap = d3.map();
            legendSpec.labels.map.forEach(function(e) {
                labelMap.set(e.value, e.label);
            });

            setLabels = function() {
                const labels = scale.domain().map(function(v) {
                    const label = labelMap.get(v);
                    return (label === undefined) ? v.toString : label;
                });

                legend.labels(labels);
            };
        }
    }

    sclera.legends.info[attr] = {
        legend: legend,
        xOffset: xOffset,
        yOffset: yOffset,
        title: legendSpec.title,
        update: legendUpdate,
        setLabels: setLabels
    };
};

sclera.legends.draw = function(svg, width, height) {
    const legendsInfo = sclera.legends.info;
    const legendAttrs = Object.keys(legendsInfo).sort();

    legendAttrs.forEach(function(attr) {
        const info = legendsInfo[attr];
        if( info.update !== undefined ) info.update();
        if( info.setLabels !== undefined ) info.setLabels();
    });

    const legendAreas = svg
        .selectAll(".legend")
        .data(legendAttrs, function(attr) { return attr; });

    const entered = legendAreas.enter()
        .append("g")
        .attr("class", "legend")
        .attr("id", function(attr) { return attr; });

    entered.each(function(attr) {
        const title = legendsInfo[attr].title;
        if( title === undefined ) return;

        d3.select(this)
        .append("text")
        .attr("class", "legendtitle")
        .text(title)
    });

    entered
    .append("g")
    .attr("class", "legendcells")

    const h = [0, 0];

    legendAreas.each(function(attr, i) {
        const p = Math.floor(i/3) % 2;

        const x = p * width / 2;
        const y = h[p];

        const title = legendsInfo[attr].title;
        const xOffset = legendsInfo[attr].xOffset;
        const yOffset = title ? legendsInfo[attr].yOffset : 0;
        const translate = "translate(" + xOffset + ", " + yOffset + ")";

        d3.select(this)
        .attr("transform", "translate(" + x + "," + y + ")")
        .select(".legendcells")
        .attr("transform", translate)
        .call(legendsInfo[attr].legend);

        h[p] += this.getBBox().height + 20;
    })
};

sclera.setTooltip = function(tooltipSvg, configTooltip, transTooltip, entered) {
    if( !configTooltip ) return;

    entered
    .on("mouseover", function(d) {
        tooltipSvg.transition()
             .duration(transTooltip.fadein)
             .style("opacity", 0.9);
        tooltipSvg
             .html(configTooltip(d))
             .style("left", (d3.event.pageX + 5) + "px")
             .style("top", (d3.event.pageY - 28) + "px");
    })
    .on("mouseout", function(d) {
        tooltipSvg.transition()
             .duration(transTooltip.fadeout)
             .style("opacity", 0);
    });
};

sclera.scale = function(s) {
    let scale = undefined;

    if( s.scale === undefined ) {
        scale = d3.scale.ordinal();
        if( typeof s !== "object" ) scale.range([s]);
        return scale;
    }
    
    s = s.scale;

    if( s.type === "identityord" ) {
        scale = sclera.scale.ordinalIdentity();
    } else if( s.type === "identityquant" ) {
        scale = d3.scale.identity();
    } else if( s.type === "time" ) {
        scale = d3.time.scale();
    } else if( s.type === "linear" ) {
        scale = d3.scale.linear();
    } else if( s.type === "log" ) {
        scale = d3.scale.log();
    } else if( s.type === "sqrt" ) {
        scale = d3.scale.sqrt();
    } else if( s.type === "ordinal" ) {
        scale = d3.scale.ordinal();
    } else if( s.type === "color" ) {
        if( s.scheme === undefined ) {
            scale = d3.scale.category20();
        } else {
            scale = d3.scale[s.scheme]();
        }
    } else if( s.type === "symbol" ) {
        scale = d3.scale.ordinal();
        if( s.range === undefined ) scale.range(d3.svg.symbolTypes);
    } else {
        scale = d3.scale.linear();
    }

    if( s.range !== undefined ) scale.range(s.range);

    if( s.domain !== undefined ) {
        scale.domain(s.domain);
    } else if( s.min !== undefined || s.max !== undefined ) {
        const dom = scale.domain();
        const min = (s.min === undefined) ? dom[0] : s.min;
        const max = (s.max === undefined) ? dom[1] : s.max;

        scale.domain([min, max]);
    }

    return scale;
};

sclera.scale.ordinalIdentity = function() {
    const identity = function(domain) {
        const scale = function(x) {
            if( domain.indexOf(x) == -1 ) domain.push(x);
            return x;
        };

        scale.domain = function(x) {
            if (!arguments.length) return domain;
            domain = x.slice();
            return scale;
        };

        scale.range = scale.domain;

        scale.copy = function() {
            return identity(domain);
        };

        return scale.domain(domain);
    };

    return identity([]);
};

sclera.facet = function(spec) {
    if( spec === undefined ) spec = {};

    const facet = {};

    facet.isRowFaceted = (spec.rows !== undefined);
    facet.isColFaceted = (spec.cols !== undefined);

    facet.rows = sclera.util.dataVal(spec.rows, "_");
    facet.cols = sclera.util.dataVal(spec.cols, "_");

    facet.rowValueString = facet.colValueString = function(v) { return v };

    facet.initValueString = function(columns) {
        const valueString = function(dim) {
            if( dim === undefined || dim.index === undefined )
                return function(v) { return v };

            return sclera.util.valueString(columns[dim.index].type);
        };

        facet.rowValueString = valueString(spec.rows);
        facet.colValueString = valueString(spec.cols);
    };

    const transform = function(length, labelHeight, isBegin) {
        const isLabeled = labelHeight && labelHeight > 0;

        const adjLength = isLabeled ? (length - labelHeight) : length;
        const offset = isBegin ? (length - adjLength) : 0;

        const scale = d3.scale.ordinal().rangeBands([0, adjLength], 0.15, 0);
        const domain = [];

        const t = {};

        t.add = function(i) {
            if( domain.indexOf(i) == -1 ) {
                domain.push(i);
                scale.domain(domain);

                return true;
            }

            return false;
        };

        t.offset = offset;
        t.translate =
            isBegin ? function(i) { return offset + scale(i); } : scale;
        t.length = scale.rangeBand;

        if( isLabeled ) {
            t.label = {};
            t.label.translate = isBegin ? 0 : adjLength;
            t.label.length = labelHeight;
        }

        return t;
    };

    facet.transforms = function(width, height) {
        const transforms = {};

        const rowLabelHeight = facet.isRowFaceted ? 20 : 0;
        transforms.col = transform(width, rowLabelHeight, false);

        const colLabelHeight = facet.isColFaceted ? 5 : 0;
        transforms.row = transform(height, colLabelHeight, true);

        return transforms;
    };

    facet.nest = function(data) {
        if( spec.rows === undefined && spec.cols === undefined ) {
            const nestCol = d3.map();
            nestCol.set("_", data);

            const nest = d3.map();
            nest.set("_", nestCol);

            return nest;
        }

        const prepared = data.filter(function(d) {
            const row = facet.rows(d);
            const col = facet.cols(d);

            return (row !== undefined && row !== null) &&
                   (col !== undefined && col !== null);
        });

        return d3.nest().key(facet.rows).key(facet.cols).map(prepared, d3.map);
    };

    return facet;
};

sclera.util = {};

sclera.util.dataVal = function(v, defaultValue) {
    if( v === undefined ) {
        if( defaultValue === undefined ) {
            return undefined;
        }

        return function(d) { return defaultValue; }
    }

    if( v.index === undefined ) {
        return function(d) { return v; }; // constant
    }

    return function(d) { return d[v.index]; };
};

sclera.util.dataMap = function(value, scale) {
    return function(d) { return scale(value(d)); }
};

sclera.util.value = function(d) {
    if( d instanceof Date ) { d = d.getTime(); };
    return d;
};

sclera.util.dateformat = d3.time.format("%d %b %Y");

sclera.util.valueString = function(colType) {
    return function(v) {
        const vs = v;
        if( vs === null || vs === "null" ) {
            vs = "null";
        } else if( colType === "time" ) {
            vs = new Date(+v).toLocaleTimeString();
        } else if( colType === "date" ) {
            vs = sclera.util.dateformat(new Date(+v));
        } else if( colType === "datetime" ) {
            vs = new Date(+v).toLocaleString();
        }

        return vs;
    };
};

sclera.util.uniq = function(data, key) {
    if( !key ) return data;

    const uniqData = d3.map();
    data.forEach(function(d) { uniqData.set(key(d), d); });

    return uniqData.values();
};

sclera.util.toggleClass = function(e, cname) {
    e.classed(cname, !e.classed(cname));
};

sclera.download = function(svg, fname, ftype) {
    ftype = ftype || "jpeg";
    const fext = (ftype === "jpeg") ? "jpg" : ftype;

    const html = d3.select(svg)
        .attr("version", 1.1)
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .node().parentNode.innerHTML;

    const image = new Image;
    image.src = 'data:image/svg+xml;base64,'+ btoa(html);

    image.onload = function() {
        let imagedata = undefined;

        if( ftype === "svg" ) {
            imagedata = image.src;
        } else {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            canvas.width = image.width;
            canvas.height = image.height;
        
            context.drawImage(image, 0, 0);
            imagedata = canvas.toDataURL("image/" + ftype);
        }

        const a = document.createElement("a");
        a.download = fname + "." + fext;
        a.href = imagedata;
        a.click();
    };
};

sclera.style = function(name, aes) {
    return [
      "/* <![CDATA[ */",
        "#" + name + " {",
          "font-size: 9px;",
          "font-family: sans-serif;",
          "background-color: " + aes.color + ";",
        "}",
        "#" + name + " .x.axis path, .x.axis line {",
          "fill: none;",
          "stroke: " + aes.x.color + ";",
          "shape-rendering: crispEdges;",
        "}",
        "#" + name + " .x.axis .tick line {",
          "stroke: " + aes.x.ticks,
        "}",
        "#" + name + " .y.axis path, .y.axis line {",
          "fill: none;",
          "stroke: " + aes.y.color + ";",
          "shape-rendering: crispEdges;",
        "}",
        "#" + name + " .y.axis .tick line {",
          "stroke: " + aes.y.ticks + ";",
        "}",
        "#" + name + " .legend {",
          "font-weight: 700;",
        "}",
        "#" + name + " .legend text.legendtitle {",
          "font-size: 10px;",
        "}",
        "#" + name + " .label {",
          "font-weight: 700;",
        "}",
        "#" + name + " .legend .label {",
          "font-size: 100%;",
        "}",
        "#" + name + " .axis .label {",
          "font-size: 75%;",
        "}",
        "#" + name + " text.collabel {",
          "font-size: 12px;",
          "font-weight: 700;",
        "}",
        "#" + name + " text.rowlabel {",
          "font-size: 12px;",
          "font-weight: 700;",
        "}",
      "/* ]]> */"
    ].join(" ");
};

sclera.table = function() {
    const table = {};

    const tcontainer = d3.select(document.createElement("div"))
        .attr("class", "table-container");

    const tmain = tcontainer
        .append("table")
        .attr("class", "table");

    const thead = tmain.append("thead")
        .attr("class", "thead-light");
    const theadr = thead.append("tr");

    const tbody = tmain.append("tbody");

    const tcaption = tmain.append("caption")
        .attr("align", "bottom")
        .text("(0 rows)");

    table.setColumns = function(columns) {
        table.columns = columns;
        table.indexCol = columns.findIndex(function(col) {
            return col.name == "#";
        });

        theadr.selectAll(".th")
            .data(columns).enter()
            .append("th")
            .attr("scope", "col")
            .classed("sclera-indexcol", function(_, i) {
                return (i == table.indexCol);
            })
            .text(function(col) { return col.name; });

        if( table.indexCol >= 0 ) theadr.on("click", function(_, i) {
            const h = d3.select(this);

            if( h.classed("sort-asc") ) {
                h.classed("sort-asc", false);
                h.classed("sort-desc", true);
                tbody.sort(function(a, b) {
                    return d3.descending(a[i], b[i]);
                });
            } else if( h.classed("sort-desc") ) {
                h.classed("sort-desc", false);

                const n = table.indexCol;
                tbody.sort(function(a, b) {
                    return d3.ascending(a[n], b[n]);
                });
            } else {
                h.classed("sort-asc", true);
                tbody.sort(function(a, b) {
                    return d3.ascending(a[i], b[i]);
                });
            }
        });
    };

    table.render = function(resultContainer) {
        resultContainer.append(function() { return tcontainer.node(); });
    };

    let nRows = 0;
    table.update = function(rows) {
        tbody.selectAll("tr")
            .data(rows, function(row, i) {
                return (table.indexCol < 0) ? i : row[table.indexCol];
            }).enter()
            .append("tr")
            .selectAll("td")
            .data(function(row) { return row; }).enter()
            .append("td")
            .classed("sclera-indexcol", function(_, i) {
                return (i == table.indexCol);
            })
            .text(function(v, i) {
                if( v === null )
                    return "null";
                if( table.columns[i].type === "time" )
                    return new Date(+v).toLocaleTimeString();
                if( table.columns[i].type === "date" )
                    return new Date(+v).toLocaleDateString();
                if( table.columns[i].type === "datetime" )
                    return new Date(+v).toLocaleString();
                return v;
            });

        nRows += rows.length;
        tcaption.text("(" +
            nRows + " " + ((nRows == 1) ? "row" : "rows") +
        ")");
    };

    return table;
};

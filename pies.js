/**
 * Abstract behavior for a pie chart.
 * @param coords
 * @constructor
 */
function AbstractPieChart(coords) {
    this.cx = coords.cx;
    this.cy = coords.cy;
    this.r = coords.r;
}

AbstractPieChart.prototype.makeLabel = function(piece) {
    let subLabel = "";
    if (piece.label) {
      subLabel = `: ${piece.label}`;
    }
    return `${piece.pct * 100}%${subLabel}`;
};

/**
 * Calculate the x,y coord for a circle given a desired pie chart percentage
 * @param pct
 * @returns {{x: *, y: *}}
 */
AbstractPieChart.prototype.calcCoord = function(pct) {
    const angle = pct * 2 * Math.PI;
    const x = this.cx + this.r * Math.cos(angle);
    const y = this.cy + this.r * Math.sin(angle);
    return {x, y};
};


/**
 * Pie Chart based on a SVG implementation.  Will use svg paths to generate
 * a pie chart.
 *
 * @param coords
 * @param elem  - svg dom element we will use to create the pie chart
 * @constructor
 */
function SVGPieChart(coords, elem) {
    AbstractPieChart.call(this, coords);
    this.chart = elem;
}
SVGPieChart.prototype = Object.create(AbstractPieChart.prototype);

/**
 * Draw a pie chart with the provided slices
 * @param slices
 */
SVGPieChart.prototype.draw = function(slices) {
    const self = this;

    function addTitle(parent, piece) {
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.appendChild(document.createTextNode(self.makeLabel(piece)));
        parent.appendChild(title);
    }

    const sweep = 1;

    // short circuit for 100% case... arcs don't seem to render in svg if
    // they are a full circle, so catch this case and draw a circle instead
    if (slices && slices.length === 1 && slices[0].pct === 1) {
        const piece = slices[0];
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", self.cx);
        circle.setAttribute("cy", self.cy);
        circle.setAttribute("r", self.r);
        circle.setAttribute("fill", piece.color);
        circle.setAttribute("stroke", "black");
        addTitle(circle, piece);
        self.chart.appendChild(circle);
        return;
    }

    let move = `M${self.cx + self.r} ${self.cy}`;
    let totalPct = 0;
    slices.forEach((piece) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        addTitle(path, piece);

        const endCoord = self.calcCoord(totalPct + piece.pct);
        let largeArc = 0;
        if (piece.pct > .5) {
          largeArc = 1;
        }

        const slice = `
          ${move}
          A ${self.r} ${self.r}, 0, ${largeArc}, ${sweep}, ${endCoord.x} ${endCoord.y}
          L ${self.cx} ${self.cy}
          Z`;
       path.setAttribute("d", slice);
       path.setAttribute("fill", piece.color);
       path.setAttribute("stroke", "black");
       self.chart.appendChild(path);
       totalPct = totalPct + piece.pct;
       move = `M${endCoord.x} ${endCoord.y}`;
    }, self);
};


/**
 * Canvas based implementation of a pie chart.
 * @param coords
 * @param layers - Requires 3 canvas layers to render the pie chart
 * @constructor
 */
function CanvasPieChart(coords, layers) {
    AbstractPieChart.call(this, coords);
    this.mainCanvas = layers.mainCanvas;
    this.hitCanvas = layers.hitCanvas;
    this.tipCanvas = layers.tipCanvas;
}
CanvasPieChart.prototype = Object.create(AbstractPieChart.prototype);

CanvasPieChart.prototype.draw = function(slices) {
    const self = this;
    const mainCtx = self.mainCanvas.getContext("2d");
    const hitCtx = self.hitCanvas.getContext("2d");
    const tipCtx = self.tipCanvas.getContext("2d");
    const colorLookup = {};

    function incrementColor(rgb) {
      let pos = 0;
      for(let pos=0; pos < 3; pos++) {
        if (rgb[pos] < 255) {
          rgb[pos] = rgb[pos] + 1;
          break;
        }
        pos = pos + 1;
      }
    }

    function drawPath(ctx, piece, startAngle, endAngle, fillStyle) {
        ctx.beginPath();
        ctx.fillStyle = fillStyle;
        ctx.arc(self.cx, self.cy, self.r, startAngle, endAngle);
        ctx.lineTo(self.cx, self.cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    let totalPct = 0;
    let startAngle = 0;
    let colorCounter = [0,0,0];

    slices.forEach((piece) => {
      const endAngle = (totalPct + piece.pct) * 2 * Math.PI;
      drawPath(mainCtx, piece, startAngle, endAngle, piece.color);

      /*
        Using a hack/trick in order to detect which paths a mouse over event
        is occuring on...  addHitRegion isn't well supported (as well as
        Path2D objects), so it appears a trick people are using is to register
        a color with each path in a hidden "hitCanvas" that has the same paths
        drawn as your main canvas.  Then when mouse events occur you can get
        the pixel under the cursor to do a direct lookup on your path.
       */
      const colorKey = colorCounter.join(",");
      drawPath(hitCtx, piece, startAngle, endAngle, `rgb(${colorKey})`);
      colorLookup[colorKey] = {label: self.makeLabel(piece)};

      incrementColor(colorCounter);
      totalPct = totalPct + piece.pct;
      startAngle = endAngle;
    }, self);

    function displayLabel(x, y, text) {
      const fontSize = 10;
      tipCtx.beginPath();
      const measured = tipCtx.measureText(text.label);
      const width = measured.width + 12;
      const height = fontSize * 2 + 10;

      tipCtx.fillStyle = "white";
      tipCtx.rect(x-width/2, y-height/2, width, fontSize+10);
      tipCtx.fill();
      tipCtx.stroke();

      tipCtx.beginPath();
      tipCtx.font = `${fontSize}pt Sans Serif`;
      tipCtx.fillStyle = "black";
      tipCtx.textAlign = "center";
      tipCtx.fillText(text.label, x, y);
    }

    self.tipCanvas.addEventListener("mousemove", (event) => {
      const rect = self.hitCanvas.getBoundingClientRect();
      const canvasCoord = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      tipCtx.clearRect(0, 0, self.tipCanvas.width, self.tipCanvas.height);

      const pixelData = hitCtx.getImageData(
          canvasCoord.x, canvasCoord.y, 1, 1).data;
      if (!pixelData) {
        return;
      }

      const label = colorLookup[`${pixelData.slice(0,3).join(",")}`];
      if (!label) {
        return;
      }

      displayLabel(canvasCoord.x, canvasCoord.y, label);
    });

    self.tipCanvas.addEventListener("mouseleave", () => {
      tipCtx.clearRect(0, 0, self.tipCanvas.width, self.tipCanvas.height);
    });
};

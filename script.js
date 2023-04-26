"use strict";

//uncheck all layers to overwrite any that might still be checked in cache
document.querySelectorAll(".layerToggle").forEach((el) => {
  el.checked = false;
});

const initBBox = [
  [21.2, 42.9], // [west, south]
  [41.5, 52.75], // [east, north]
];

// map cannot be zoomed/panned outside of these bounds
const maxBounds = [
  [initBBox[0][0] - 15, initBBox[0][1] - 10],
  [initBBox[1][0] + 15, initBBox[1][1] + 10],
];

// initialise map
var map = new maplibregl.Map({
  container: "map",
  style:
    "https://api.maptiler.com/maps/bright/style.json?key=29pOogG422DKpW4WspFu",
  bounds: initBBox,
  maxBounds: maxBounds,
  preserveDrawingBuffer: true,
});

// all data layers will be placed under this and all following layers
// makes city/country labels show up above data points
const layerUnder = "place-other";

// set min zoom to be one less than the zoom calculated to fit the bbox
const minZoom = map.getZoom() - 1;
map.setMinZoom(minZoom);

const layers = ["hc"];


// check boxes accordingly once layers are loaded (see end of map initialization function below)

// make info boxes togglable
layers.forEach((layer) => {
  d3.select("#" + layer + "-info-box")
    .classed("hidden", true)
    .append("span")
    .attr("class", "closebtn")
    .html("&times;")
    .on("click", () =>
      d3.select("#" + layer + "-info-box").classed("hidden", true)
    );
  d3.select("#" + layer + "-info").on("click", () => {
    // show popup
    d3.select("#" + layer + "-info-box").classed("hidden", false);
  });
});

// auto-generate options boxes for three of the datasets

// color schemes
let colorScheme = {
  
  // humanitarian corridors status_result color scheme
  hc: [
    ["successful", "#0e73bd"],
    ["disputed", "#860ebd"],
    ["unsuccessful/disrupted", "#a40909"],
    ["proposed route/outcome unknown", "#888"],
  ]
};
let optionLabels = {
 
  hc: (d) => d

};
// add option menus
Object.keys(colorScheme).forEach(function (layer) {
  let options = d3
    .select(`#${layer}-options`)
    .append("div")
    .selectAll("label")
    .data(colorScheme[layer])
    .enter()
    .append("label")
    .attr("class", "checkbox-container")
    .html((d) => optionLabels[layer](d[0]));
  options
    .append("input")
    .attr("type", "checkbox")
    .attr("class", "filterInput")
    .attr("id", (d) => `filter_${layer}_${d[0]}`)
    .attr("name", (d) => d[0])
    .property("checked", true);
  options
    .append("span")
    .attr("class", "checkmark")
    .style("background-color", (d) => d[1]);
});

// add zoom to region feature
d3.json("data/ukraine_bounds.json").then(function (data) {
  // get zoom options dropdown and add all admin regions as options
  let zoom_options = d3.select("#selectZoomTo");
  zoom_options.append("optgroup").attr("label", "Administrative Regions");
  zoom_options
    .selectAll(".oblast")
    .data(data)
    .enter()
    .append("option")
    .attr("class", "oblast")
    .attr("value", (d) => d.name_en)
    .html((d) => d.name_en);

  // listen for changes to dropdown + trigger zoom
  zoom_options.on("change", function () {
    // get selected option
    let select = document.getElementById("selectZoomTo");
    let zoomTo = select.options[select.selectedIndex].value;

    // get bounds and zoom map to bounds
    map.easeTo(
      map.cameraForBounds(data.find((d) => d.name_en === zoomTo).bounds)
    );
    // reset dropdown value after 1s
    setTimeout(() => (select.options[0].selected = true), 1000);
  });
});

Promise.all([
  d3.csv("data/Humanitarian Corridors Ukraine - HC_geocoded.csv"), // humanitarian corridors
]).then(function (data) {
  // modify data

  

  const hc = data[5];
  const hc_geojson = {
    type: "FeatureCollection",
    features: hc.map(function (el) {
      return {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: arcPoints(
            [+el.from_longitude, +el.from_latitude],
            [+el.to_longitude, +el.to_latitude],
            0.2,
            20
          ),
        },
        properties: el,
      };
    }),
  };
  hc_geojson.features.forEach(function (d) {
    d.properties.timestamp_start = new Date(d.properties.date).getTime();
    d.properties.timestamp_end = new Date(d.properties.date).getTime();
  });

  // when map is ready, add data sources + vis layers
  map.on("load", function () {
    

    map.addSource("hc", {
      type: "geojson",
      data: hc_geojson,
    });

    var popup = new maplibregl.Popup();

    map.addLayer(
      {
        id: "hc-layer",
        type: "line",
        source: "hc",
        layout: {
          visibility: "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "status_result"],
            ...colorScheme.hc.flat(),
            d3.schemeTableau10[9], // grey for missing types
          ],
          "line-width": 5,
          "line-opacity": 0.6,
        },
      },
      layerUnder
    );
    map.on("click", "hc-layer", (e) => {
      var coordinates = e.lngLat;
      var tooltip =
        "Humanitarian Corridor:<br>Date: " +
        e.features[0].properties.date +
        "<br>From " +
        e.features[0].properties.from_name +
        " (" +
        e.features[0].properties.from_country_code +
        ") to " +
        e.features[0].properties.to_name +
        " (" +
        e.features[0].properties.to_country_code +
        ")<br>Status: " +
        e.features[0].properties.status_result;
      popup.setLngLat(coordinates).setHTML(tooltip).addTo(map);
    });
    // change cursor to pointer when on the powerplants layer
    map.on("mouseenter", "hc-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "hc-layer", () => {
      map.getCanvas().style.cursor = "";
    });

    map.loadImage("img/arrow2.png", function (err, image) {
      if (err) {
        console.error("err image", err);
        return;
      }
      map.addImage("arrow", image, { sdf: "true" });
      map.addLayer(
        {
          id: "hc-arrow-layer",
          type: "symbol",
          source: "hc",
          layout: {
            visibility: "none",
            "symbol-placement": "line",
            "symbol-spacing": 1,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-image": "arrow",
            "icon-size": 5 / 24, // icon size is 24, scale to line width
          },
          paint: {
            "icon-color": [
              "match",
              ["get", "status_result"],
              ...colorScheme.hc.flat(),
              d3.schemeTableau10[9], // grey for missing types
            ],
          },
        },
        layerUnder
      );
    });

    // wait for data to load, then remove loading messages
    layers.map((l) =>
      waitFor(() => map.isSourceLoaded(l)).then(() => {
        document.getElementById(l + "-header").classList.remove("loading");
        // check/uncheck based on layer settings
        let c = document.getElementById("toggle-" + l);
        c.checked = layerSettings[l];
        // dispatch change event so the map updates
        c.dispatchEvent(new Event("change"));
      })
    );
  });
});

// FILTERS + LAYER TOGGLES

// listen for changes on all filter input elements
// using a class .filterInput here to ensure input elements elsewhere
// on the page do not trigger filter updates (performance)
document.querySelectorAll(".filterInput").forEach((el) => {
  el.addEventListener("change", (e) => {
    // show/hide data layers
    layers.forEach((layer) => {
      if (document.getElementById(`toggle-${layer}`).checked) {
        map.setLayoutProperty(`${layer}-layer`, "visibility", "visible");
        if (layer === "hc") {
          map.setLayoutProperty(`hc-arrow-layer`, "visibility", "visible");
        } else if (layer === "epr") {
          map.setLayoutProperty(`epr-outline-layer`, "visibility", "visible");
        }
        // update filters for visible layers
        updateFilters(layer);
      } else {
        // hide unchecked layers, no need to update until checked again
        map.setLayoutProperty(`${layer}-layer`, "visibility", "none");
        if (layer === "hc") {
          map.setLayoutProperty(`hc-arrow-layer`, "visibility", "none");
        } else if (layer === "epr") {
          map.setLayoutProperty(`epr-outline-layer`, "visibility", "none");
        }
      }
    });
  });
});

function updateFilters(layer) {
  let c, t, filters;
  switch (layer) {
    case "hc":
      c = getCategoryFilter("hc", "status_result");
      t = getDateFilter();
      filters = ["all", c, t.min, t.max];
      map.setFilter("hc-layer", filters);
      map.setFilter("hc-arrow-layer", filters);
      break;
    
    default:
      console.log("error - filters not implemented for layer: ", layer);
  }

  function getDateFilter() {
    // get time span
    // using time stamps bc maplibre does not support date objects
    let minDate = getDate("min-date");
    let maxDate = getDate("max-date");
    function getDate(id) {
      let d = document.getElementById(id).value;
      if (d === "") {
        return null;
      } else {
        return new Date(d).getTime();
      }
    }
    let minDateFilter =
      minDate === null
        ? true
        : [">=", ["number", ["get", "timestamp_end"]], minDate];
    let maxDateFilter =
      maxDate === null
        ? true
        : ["<=", ["number", ["get", "timestamp_start"]], maxDate];
    return { min: minDateFilter, max: maxDateFilter };
  }

  function getCategoryFilter(layer, varName) {
    // get list of checked layers
    let allNodes = document
      .getElementById(layer + "-options")
      .querySelectorAll("input[type=checkbox]");
    let checkedNodes = document
      .getElementById(layer + "-options")
      .querySelectorAll("input[type=checkbox]:checked");
    let checkedTypes = Array.from(checkedNodes).map(
      (d) => d.attributes.name.value
    );
    // set category filter accordingly
    let categoryFilter =
      checkedNodes.length === allNodes.length
        ? // remove filter if all are checked
          true
        : // otherwise filter for checked items only
          ["in", ["to-string", ["get", varName]], ["literal", checkedTypes]];
    return categoryFilter;
  }
}

function resetFilters() {
  // set layer filters according to settings
  layers.forEach((l) => {
    document.getElementById("toggle-" + l).checked = layerSettings[l];
  });

  // check all sub-options for all layers
  let opt = document.querySelectorAll(".layerOptions input");
  opt.forEach((el) => {
    el.checked = true;
  });

  // reset date inputs
  document.getElementById("min-date").value = "";
  document.getElementById("max-date").value = "";
  // dispatch a single change event to make the map update
  filters[0].dispatchEvent(new Event("change"));
}

// zoom buttons
document.getElementById("zoomIn").addEventListener("click", (e) => {
  map.zoomIn();
});
document.getElementById("zoomOut").addEventListener("click", (e) => {
  map.zoomOut();
});
document.getElementById("zoomReset").addEventListener("click", (e) => {
  map.easeTo(map.cameraForBounds(initBBox));
});

function captureScreenshot() {
  // download image
  // https://stackoverflow.com/questions/3906142/how-to-save-a-png-from-javascript-variable
  var download = document.createElement("a");
  download.href = map.getCanvas().toDataURL();
  download.download = "screenshot.png";
  download.click();
  // to open image in new tab (requires popup permission) instead:
  // window.open(map.getCanvas().toDataURL());
}

// https://stackoverflow.com/questions/7193238/wait-until-a-condition-is-true
function waitFor(conditionFunction) {
  const poll = (resolve) => {
    if (conditionFunction()) resolve();
    else setTimeout((_) => poll(resolve), 100);
  };
  return new Promise(poll);
}

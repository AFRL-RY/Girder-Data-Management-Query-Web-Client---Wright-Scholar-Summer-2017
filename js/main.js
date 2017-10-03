/*
* main.js: Sets up map with heatmap layer and annotation (region selection) capabilities
*/

var annotationDebug = {}; // used for debugging map annotations

// Map init
$(function () {
  'use strict';

  var map, layer, dotLayer, fromButtonSelect, fromGeojsonUpdate, currentResults = [], resultsView, heatmap, heatLayer, heatmapPoints = [], heatmapFilterlessPoints = [], heatmapFilterComponent; // maps field name to slider

  moment.tz.setDefault('UTC'); // default to UTC time
  $.fn.Lazy = $.fn.lazy = window.mylazy; // Grab the jQuery LazyLoad plugin function from window due to namespace bug

  /*
  * GeoJS initialization...mostly copied from the "annotations" example on geojs website
  */

  // get the query parameters and set controls appropriately
  var query = utils.getQuery();
  $('#clickadd').prop('checked', query.clickadd !== 'false');
  $('#keepadding').prop('checked', query.keepadding === 'true');
  if (query.lastannotation) {
    $('.annotationtype button').removeClass('lastused');
    $('.annotationtype button#' + query.lastannotation).addClass('lastused');
  }
  // You can set the intiial annotations via a query parameter.  If the query
  // parameter 'save=true' is specified, the query will be updated with the
  // geojson.  This can become too long for some browsers.
  var initialGeoJSON = query.geojson;

  // respond to changes in our controls
  $('#controls').on('change', change_controls);
  $('#geojson[type=textarea]').on('input propertychange', change_geojson);
  $('.annotationtype button').on('click', select_annotation);
  $('#heatmap-hide').click(function (evt) {
    var target = $(evt.target);
    if (heatLayer.opacity() == 0) {
      target.text("Hide Heatmap Layer");
      heatLayer.opacity(0.6)
    } else {
      target.text("Show Heatmap Layer");
      heatLayer.opacity(0.0)
    }
  })

  // Custom button handlers
  $('#jumpto').on('click', jumpTo);
  $('#showjumpto').click(function () {
    $('#jumpto-form-group').toggle();
  })
  $('#search').on('click', searchUsingRegion);

  $('#controls').toggleClass('no-controls', query.controls === 'false');

  // start the map near Fresno unless the query parameters say to do otherwise
  map = geo.map({
    node: '#map',
    center: {
      x: query.x ? +query.x : -110.0,
      y: query.y ? +query.y : 39.0
    },
    zoom: query.zoom ? +query.zoom : 3,
    rotation: query.rotation ? +query.rotation * Math.PI / 180 : 0,
  });
  // allow some query parameters to specify what map we will show
  if (query.map !== 'false') {
    if (query.map !== 'satellite') {
      annotationDebug.mapLayer = map.createLayer('osm', !config.osmOnline ? {url: '/tiles/{z}/{x}/{y}.png'} : null);
    }
    if (query.map === 'satellite' || query.map === 'dual') {
      annotationDebug.satelliteLayer = map.createLayer('osm', {url: 'http://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.png', opacity: query.map === 'dual' ? 0.25 : 1});
    }
  }
  // create an annotation layer
  layer = map.createLayer('annotation', {
    renderer: query.renderer ? (query.renderer === 'html' ? null : query.renderer) : undefined,
    annotations: query.renderer ? undefined : geo.listAnnotations()
  });
  // Dot layer will show dots when user makes a region selection
  dotLayer = map.createLayer('annotation', {
    renderer: query.renderer ? (query.renderer === 'html' ? null : query.renderer) : undefined,
    annotations: undefined
  });

  /*
  * Heatmap setup
  */
  var layerOptions = {
    features: ['heatmap'],
    opacity: 0.6
  };

  var heatmapOptions = {
    binned: 'auto',
    minIntensity: 0,
    maxIntensity: 4,
    style: {
      blurRadius: config.heatmap_radius,
      color: {
        0.00: {r: 0, g: 0, b: 0, a: 0.0},
        0.25: {r: 0, g: 1, b: 0, a: 0.5},
        0.50: {r: 1, g: 1, b: 0, a: 0.8},
        1.00: {r: 1, g: 0, b: 0, a: 1.0}
      },
      radius: config.heatmap_blur_radius
    },
    updateDelay: 50,
  };


  // Heatmap data will be passed in object like:
  // {i: <some intensity number>, c: [<x coord>, <y coord>]}

  heatLayer = map.createLayer('feature', layerOptions);
  heatmap = heatLayer.createFeature('heatmap', heatmapOptions)
  .intensity(function (d) {
    return Math.log10(d.i*10);
  })
  .position(function (d) {
    return {x: d.c[0], y: d.c[1]};
  });
  /* Make some values available in the global context so curious people can
  * play with them. (this part copied from GeoJS heatmap example) */
  window.heatmap = {
    map: map,
    layer: layer,
    layerOptions: layerOptions,
    heatmap: heatmap,
    heatmapOptions: heatmapOptions
  };

  // $('#controls').on('change', change_controls);

  // bind to the mouse click and annotation mode events
  layer.geoOn(geo.event.mouseclick, mouseClickToStart);
  layer.geoOn(geo.event.annotation.mode, handleModeChange);
  layer.geoOn(geo.event.annotation.add, handleAnnotationChange);

  layer.geoOn(geo.event.annotation.update, handleAnnotationChange);
  layer.geoOn(geo.event.annotation.remove, handleAnnotationChange);
  layer.geoOn(geo.event.annotation.state, handleAnnotationChange);

  map.draw();

  // Hide controls which depend on which annotation type is selected
  $('#query-type').css('display', 'none');
  $('.radius-input').css('display', 'none');

  // pick which button is initially highlighted based on query parameters.
  if (query.lastused || query.active) {
    if (query.active) {
      layer.mode(query.active);
    } else {
      $('.annotationtype button').removeClass('lastused active');
      $('.annotationtype button#' + query.lastused).addClass('lastused');
    }
  }

  // if we have geojson as a query parameter, populate our annotations
  if (initialGeoJSON) {
    layer.geojson(initialGeoJSON, true);
  }

  // expose some internal parameters so you can examine them from the console
  annotationDebug.map = map;
  annotationDebug.layer = layer;
  annotationDebug.query = query;


  girder.events.on('g:login', function () {
    console.log("g:login");
    if (girder.auth.getCurrentUser()) {
      sample(0);
    }
  });

  /*
  * Draggable controls setup
  */

  function dragMoveListener (event) {
    var target = event.target,
    // keep the dragged position in the data-x/data-y attributes
    x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx,
    y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    // translate the element
    target.style.webkitTransform =
    target.style.transform =
    'translate(' + x + 'px, ' + y + 'px)';

    // update the posiion attributes
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
  }

  interact('.controls')
  .draggable({
    onmove: dragMoveListener
  })
  .resizable({
    preserveAspectRatio: false,
    edges: { left: true, right: true, bottom: true, top: true }
  })
  .on('resizemove', function (event) {
    var target = event.target,
    x = (parseFloat(target.getAttribute('data-x')) || 0),
    y = (parseFloat(target.getAttribute('data-y')) || 0);

    // update the element's style
    target.style.width  = event.rect.width + 'px';
    target.style.height = event.rect.height + 'px';

    // translate when resizing from top or right/left edges
    x += target.id == "heatmap-filters" ? event.deltaRect.right : event.deltaRect.left;
    y += event.deltaRect.top;

    target.style.webkitTransform = target.style.transform =
    'translate(' + x + 'px,' + y + 'px)';

    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
    // target.textContent = Math.round(event.rect.width) + '×' + Math.round(event.rect.height);
  });



  /**
  * When the mouse is clicked, switch to adding an annotation if appropriate.
  *
  * @param {geo.event} evt geojs event.
  */
  function mouseClickToStart(evt) {
    if (evt.handled) {
      return;
    }
    if (evt.buttonsDown.left) {
      if ($('.annotationtype button.lastused').hasClass('active')) {
        return;
      }
      select_button('.annotationtype #rectangle');
    }
  }

  /**
  * Handle changes to our controls.
  *
  * @param evt jquery evt that triggered this call.
  */
  function change_controls(evt) {
    var ctl = $(evt.target),
    param = ctl.attr('param-name'),
    value = ctl.val();
    if (ctl.is('[type="checkbox"]')) {
      value = ctl.is(':checked') ? 'true' : 'false';
    }
    if (value === '' && ctl.attr('placeholder')) {
      value = ctl.attr('placeholder');
    }
    if (!param || value === query[param]) {
      return;
    }
    query[param] = value;
    if (value === '' || (ctl.attr('placeholder') &&
    value === ctl.attr('placeholder'))) {
      delete query[param];
    }
    // update our query parameters, os when you reload the page it is in the
    // same state
    utils.setQuery(query);
  }

  /**
  * Handle changes to the geojson.
  *
  * @param evt jquery evt that triggered this call.
  */
  function change_geojson(evt) {
    var ctl = $(evt.target),
    value = ctl.val();
    // when we update the geojson from the textarea control, raise a flag so we
    // (a) ignore bad geojson, and (b) don't replace the user's geojson with
    // the auto-generated geojson
    fromGeojsonUpdate = true;
    var result = layer.geojson(value, 'update');
    if (query.save && result !== undefined) {
      var geojson = layer.geojson();
      query.geojson = geojson ? JSON.stringify(geojson) : undefined;
      utils.setQuery(query);
    }
    fromGeojsonUpdate = false;
  }

  /**
  * Handle selecting an annotation button.
  *
  * @param evt jquery evt that triggered this call.
  */
  function select_annotation(evt) {
    select_button(evt.target);
  }

  /**
  * Select an annotation button by jquery selector.
  *
  * @param {object} ctl a jquery selector or element.
  */
  function select_button(ctl) {
    ctl = $(ctl);
    var wasactive = ctl.hasClass('active'),
    id = ctl.attr('id');
    fromButtonSelect = true;
    layer.mode(wasactive ? null : id);
    fromButtonSelect = false;
  }

  /**
  * When the annotation mode changes, update the controls to reflect it.
  *
  * @param {geo.event} evt a geojs mode change event.
  */
  function handleModeChange(evt) {
    // highlight the current buttons based on the current mode
    var mode = layer.mode();
    $('.annotationtype button').removeClass('active');
    $('#results-count').html(''); // clear results count
    if (mode) {
      $('.annotationtype button').removeClass('lastused active');
      $('.annotationtype button#' + mode).addClass('lastused active');
      $('#query-type').css('display', mode === 'point' ? 'none' : '')
      $('.radius-input').css('display', mode === 'point' ? '' : 'none')
    }
    $('#instructions').attr(
      'annotation', $('.annotationtype button.active').attr('id') || 'none');
      query.active = $('.annotationtype button.active').attr('id') || undefined;
      query.lastused = query.active ? undefined : $('.annotationtype button.lastused').attr('id');
      utils.setQuery(query);
    }

    /**
    * When an annotation is created or removed, update our list of annotations.
    *
    * @param {geo.event} evt a geojs mode change event.
    */
    function handleAnnotationChange(evt) {
      if (evt.annotation.layer() != layer) return;
      var annotations = layer.annotations();
      var ids = annotations.map(function (annotation) {
        return annotation.id();
      });
      var present = [];

      // Ensure there is no more than one active annotation
      if (annotations.length > 1) {
        // 1st parameter says that annotations being created should be skipped.
        // 2nd parameter says that the layer should be updated after changes
        console.log("Removing all");
        layer.removeAllAnnotations(true, true);
      }

      $('#annotationheader').css('display', $('#annotationlist .entry').length <= 1 ? 'none' : 'block');
      if (!fromGeojsonUpdate) {
        // update the geojson textarea
        var geojson = layer.geojson();
        $('#geojson').val(geojson ? JSON.stringify(geojson, undefined, 2) : '');
        if (query.save) {
          query.geojson = geojson ? JSON.stringify(geojson) : undefined;
          utils.setQuery(query);
        }
      }

      if (layer.annotations().length == 1) {
        var annotation = layer.annotations()[0];
        console.log(annotation);
        if (annotation.type() == "point") {
          annotation.style("radius", 3);
          annotation.style("fillColor", {r: 0, g: 0, b: 1});
        }
        if (annotation.state() == geo.annotation.state.done) {
          fetchRenderPoints(annotation, 0);
        }
      }
    }

    /**
    * Jump to coordinates specified by text fields
    */
    function jumpTo(btn) {
      var lat = $("#lat-field").val();
      var lon = $("#lon-field").val();
      map.center({x: lon, y:lat});
    }


    /**
    * Search in the region given by the currently active geo.js annotation
    */
    function searchUsingRegion() {
      var annotations = layer.annotations();
      if (annotations.length != 1) return;

      var region = annotations[0];
      if (region.state() != geo.annotation.state.done) {
        return;
      }
      currentResults = [];

      // Perform the search
      var query = getActiveGeoquery(region);

      resultsView = new ResultsView(query, JSON.parse(JSON.stringify(heatmapFilterComponent.selectedFilters)), heatmapFilterComponent.string_metadata_keys.slice(), heatmapFilterComponent.numerical_metadata_keys.slice());
      $('#results').modal();

    }

    /*
    * Returns a MongoDB-compatible query object from 'region' (Geo-JS annoation object)
    * and an optional query type (within/intersects).
    */
    function getActiveGeoquery(region, overrideQueryType) {
      var query = {};

      if (region.type() === 'point') {
        query["geometry"] = {
          "$near": {
            "$geometry": region.geojson().geometry,
            "$minDistance": $('#min-dist-field').val(),
            "$maxDistance": $('#max-dist-field').val()
          }
        }
      } else {
        var type = overrideQueryType || $('#query-type').val();
        var geoOperator = "$geo" + type.charAt(0).toUpperCase() + type.slice(1);

        var fieldSpecifier = {};
        fieldSpecifier[geoOperator] = {
          "$geometry": region.geojson().geometry
        }
        query["geo.geometry"] = fieldSpecifier;
      }
      return query;
    }

    /*
    * Begins sampling all items matching the selected metadata filters, using a given offset and query,
    * or defaults to a query defined by the currently selected filters in heatmapFilterComponent.
    */
    function sample(offset, query) {
      var limit = config.heatmap_sample_limit;
      if (!query) {
        query = heatmapFilterComponent ? JSON.stringify(heatmapFilterComponent.generateQueryObject()) : "{}";
      }
      console.log("Sample at offset "+offset+" (limit "+limit+") -- "+query);

      if (query == "{}") {
        $("#heatmap-sample-status").toggle(true);
      }

      // If it's the current query, show "Loading heatmap...." text
      if (heatmapFilterComponent && query == JSON.stringify(heatmapFilterComponent.generateQueryObject())) {
        $(".heatmap-sample2-status").toggle(true);
      }

      girder.rest.restRequest({
        path: 'item/geospatial',
        data:{
          q: query,
          limit: limit,
          offset: offset
        },
        error: null
      }).done(makeSampleResponseListener(query));

      function makeSampleResponseListener(query) {
        return function (resp) {
          if (query == "{}") {
            if (!heatmapFilterComponent) {
              heatmapFilterComponent = new FilterComponent($('#heatmap-filters'), $('#change-heatmap-fields'), {}, false, false, resp);
              heatmapFilterlessPoints = heatmapPoints;
              heatmapFilterComponent.onFilterUpdate = function() {
                if (layer.annotations().length == 1 && layer.annotations()[0].state() == geo.annotation.state.done) {
                  fetchRenderPoints(layer.annotations()[0], 0);
                }
                var newQuery = JSON.stringify(heatmapFilterComponent.generateQueryObject());
                console.log("Heatmap filter update: "+JSON.stringify(newQuery));
                // Clear heatmap
                dotLayer.removeAllAnnotations();
                heatmapPoints = [];
                heatmap.data([]);
                heatmap.draw();

                if (newQuery === "{}") {
                  heatmapPoints = heatmapFilterlessPoints;
                  heatmap.data(heatmapPoints);
                  heatmap.draw();
                } else {
                  sample(0);
                }
              }
            } else {
              heatmapFilterComponent.fetchFilterInfoAndUpdate(resp);
            }
          }

          var isCurrentQuery = heatmapFilterComponent && query == JSON.stringify(heatmapFilterComponent.generateQueryObject());
          if (!isCurrentQuery && query != "{}") {
            console.log("Not continuing sampling for query: "+query);
            return;
          }

          // Make the next request
          if (resp.length == limit) {
            sample(offset + limit*5, query);
          } else if (offset >= limit*5 && offset % (limit*5) != (limit * 4)){
            sample((offset % (limit*5)) + limit, query);
          } else {
            // Finished sampling
            console.log("Done sampling for query: "+query);
            if (query == "{}") {
              $("#heatmap-sample-status").toggle(false);
            }

            if (isCurrentQuery) {
              $(".heatmap-sample2-status").toggle(false);
            }
          }

          // Heatmap stuff
          if (!isCurrentQuery) return;

          // Render the points we found
          $.each(resp, function (idx, item) {
            addItemToHeatmap(item);
          })
          heatmap.data(heatmapPoints);
          heatmap.draw();
        }
      }
    }

    /*
    * Adds 'item' to heatmap data by rounding its coordinates and binning into heatmapPoints
    * Note: Does not automatically reload heatmap
    */
    function addItemToHeatmap(item) {
      if (!item.geo || !item.geo.geometry) return;
      var coordinates = getProperCoordinatesForItem(item);

      coordinates = coordinates.map(function (c) { return Math.round(c * Math.pow(10, config.bin_decimal_places)) / Math.pow(10, config.bin_decimal_places)});
      var existing = heatmapPoints.find(function (a) { return a.c[0] == coordinates[0] && a.c[1] == coordinates[1]});
      if (existing) {
        existing.i++;
      } else {
        heatmapPoints.push({c: coordinates, i: 1});
      }
    }

    /*
    * Returns the coordinates for *item* based on it's (non-point) geometry
    */
    function getProperCoordinatesForItem(item) {
      var coordinates = item.geo.geometry.coordinates;
      if (!coordinates || coordinates.length == 0) return [0,0];
      if (coordinates.length == 2 && !(coordinates[0] instanceof Array)) return coordinates;
      // Flatten the coordinates down into a single dimensional array.
      // This is so we get one point for every point/poly/multipoly
      while (coordinates[0] instanceof Array && coordinates[0][0] instanceof Array) {
        coordinates = coordinates[0];
      }

      var x = coordinates.map(function (c) { return c[0]; }).sort();
      var y = coordinates.map(function (c) { return c[1]; }).sort();
      var xMid = x[Math.round(x.length / 2)];
      var yMid = y[Math.round(y.length / 2)]

      x = x.filter(function (oneX) { return Math.abs(oneX - xMid) < 0.5})
      var xAvg = x.reduce(function (sum, value) { return sum + value; }, 0) / x.length
      y = y.filter(function (oneY) { return Math.abs(oneY - yMid) < 0.5})
      var yAvg = y.reduce(function (sum, value) { return sum + value; }, 0) / y.length

      return [xAvg, yAvg];
    }

    /*
    * Renders points on dotLayer for the region the user just selected
    * (recursively calls itself with different offset)
    */
    function fetchRenderPoints(region, offset) {
      var query = getActiveGeoquery(region);
      if (heatmapFilterComponent) {
        $.each(heatmapFilterComponent.generateQueryObject(), function (key, value) {
          query[key] = value;
        })
      }
      console.log("Dot sample at offset "+offset+" (limit 50) -- "+JSON.stringify(query));
      girder.rest.restRequest({
        path: 'item/geospatial',
        data:{
          q:JSON.stringify(query),
          limit: 50,
          offset: offset
        },
        error: null
      }).done(function (resp) {
        var newQuery = getActiveGeoquery(region);
        if (heatmapFilterComponent) {
          $.each(heatmapFilterComponent.generateQueryObject(), function (key, value) {
            newQuery[key] = value;
          })
        }

        if (!layer.annotations().includes(region) || JSON.stringify(query) != JSON.stringify(newQuery)) {
          console.log("Dot sample query did not match...discarding...");
          return;
        }
        if (offset == 0) {
          dotLayer.removeAllAnnotations();
        }
        // Render the points we found
        $.each(resp, function (idx, item) {
          // TODO: This is temporary since I can't find the flatten function
          if (!item.geo || !item.geo.geometry) return;
          var coordinates = getProperCoordinatesForItem(item);
          if (!coordinates[0] || !coordinates[1]) return;
          var annotation = new geo.annotation.pointAnnotation({position: {x: coordinates[0], y: coordinates[1]}})
          annotation.style("radius", 1);
          annotation.style("fillColor", {r: 0, g: 0, b: 1});
          annotation.style("strokeColor", {r: 0, g: 0, b: 1});

          dotLayer.addAnnotation(annotation);
        })
        if (resp.length == 50) {
          fetchRenderPoints(region, offset + 50);
        }
      });
    }

  })

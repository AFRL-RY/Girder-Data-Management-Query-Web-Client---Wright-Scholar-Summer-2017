/**
 * ResultsView.js - A ResultsView object is created for each click of the search button.
 * It handles the query, display, and filtering (w/ FilterComponent) of search results.
 */

var thumbnail_formats = config.thumbnail_formats;
var search_limit = 50;

/*
 * Constructor:
 * - geoQuery: MongoDB-compatible query for the geospatial region for the results
 *   ** NOTE: Should not include other metadata filters
 * - selectedFilters: selectedFilters object from a separate FilterComponent. Will be passed into new FilterComponent. Pass {} for none
 * - stringKeys: String keys to show to start, or null for defaults
 * - numericalKeys: Numerical keys to show on start, or null for defaults
 */
function ResultsView(geoQuery, selectedFilters, stringKeys, numericalKeys) {
  this.geoQuery = geoQuery;
  this.currentResults = [];
  this.samplingResults = [];
  this.selectedFilters = selectedFilters;
  this.currentLazyLoad = null;
  this.string_metadata_keys = stringKeys;
  this.numerical_metadata_keys = numericalKeys;
  this.filterComponent = new FilterComponent($('#results'), $('#change-fields'), selectedFilters, stringKeys, numericalKeys);
  this.active = true;
  this.currentOffset = 0;

  var resultsView = this;

  this.filterComponent.onFilterUpdate = function () {
    resultsView.currentOffset = 0;
    resultsView.query();
  }

  $('#slide-button').off('click');
  $('#slide-button').click(this.slide);

  $('#download-all').off('click');
  $('#download-all').click(this.downloadAll.bind(this));

  $('#next-page').off('click');
  $('#next-page').click(function () {
    resultsView.currentOffset += search_limit;
    resultsView.query();
  });

  $('#prev-page').off('click');
  $('#prev-page').click(function () {
    resultsView.currentOffset -= search_limit;
    if (resultsView.currentOffset < 0) resultsView.currentOffset = 0;
    resultsView.query();
  });

  this.query();
  this.sample(0);

  $('#results').on("hidden.bs.modal", function () {
    resultsView.active = false;
    $('#change-fields').off();
    $('#slide-button').off('click');
    $('#download-all').off('click');
    $('#prev-page').off('click');
    $('#next-page').off('click');
    if (resultsView.filterComponent) {
      resultsView.filterComponent.cleanup();
      resultsView.filterComponent = null;
    }
    resultsView.currentLazyLoad = null;
    resultsView.currentResults = null;
    resultsView.samplingResults = null;
  })

  $('#results').on("shown.bs.modal", function () {
    if (resultsView.currentLazyLoad) {
      resultsView.currentLazyLoad.update();
    }
  })



}

/**
* Called when the table needs to be updated.
*
* Currently removes all entries in the table and then re-generates
* only the items that match the selected filters.
*
* TODO: could be made more efficient if didn't re-generate (use CSS display:none?)
*/
ResultsView.prototype.renderResults = function () {
  var resultsView = this;
  $('#results-table tbody').empty();

  var count = 0;
  $.each(resultsView.currentResults, function (idx, result) {
    if (!result.meta) return;
    // This item passed all filters, so it should be rendered
    count++;
    var imagePath = (result._thumbnails && result._thumbnails.length > 0)
      ? "/file/" + result._thumbnails[0]
      : "/item/" + result._id;

    $('#results-table tbody').append("<tr> \
    <td><div class=\"lazyLoad\" data-loader=\"asyncLoader\" data-idx=\"" + idx + "\">"+result.name+"</div></td> \
    <td>" + result.meta.sensorModality + "</td> \
    <td>" + moment.unix(result.meta.timeInMilliseconds).format() + "</td>\
    <td><a href=\""+config.girder_root+"#item/" + result._id + "\" target=\"_blank\"><button class=\"button button-default view-item\" data-idx=\""+idx+"\"> View</button></a></tr>");
  });
  $('#results-table-div').scrollTop(0); // Scroll table to top
  this.initLazyLoad();

  // Update the count of filtered results (with correct plurality!)
  var rangeString = (this.currentOffset + 1) + " - " + (this.currentOffset + resultsView.currentResults.length);
  $('#filtered-count').text("Showing results " + rangeString);
  $('#download-all').text("Download all ("+rangeString+")")
}

/**
* Called when slide button is pressed. Toggles state of sliding filters menu
*/
ResultsView.prototype.slide = function() {
    if ($('#filters').css('display') != "none") {
      // Should slide left/up, out of view.
      if (window.innerWidth >= 576) {
        $('#filters').css('width', '0px');
      } else {
        $('#filters').css('height', '0px');
      }
      $('#filters').css('padding', '0px');
      $('#filters').css('overflow', 'hidden');
      $('#results-table-div').css('width', '100%');
      $('#results-table-div').css('margin-left', '0%')
      // Should be entirely hidden after animation 0.3s
      setTimeout(function() {
        $('#filters').css('display', "none");
      }, 300);
    } else {
      // Should slide into view
      $('#filters').css('display', "");
      $('#filters').css('width', '');
      $('#filters').css('height', '');
      $('#filters').css('padding', '');
      $('#results-table-div').css('width', '');
      $('#results-table-div').css('margin-left', '')
      $('#filters').css('overflow', '');
    }
}

/**
* Called when download button is pressed. Starts download of all items
* matching filters
*/
ResultsView.prototype.downloadAll = function() {
  // TODO: this has a theoretical limit because of URL length
  // Could this be turned into a POST request? (also see LocalStorage API?)

  var url = girder.rest.apiRoot + "/resource/download?resources=" + encodeURIComponent(JSON.stringify({item: this.currentResults.map(function (i) { return i._id })}))
  $('#download-frame').attr('src', url);
}

/**
* Called from updateResults() to initialize the lazy loading plugin
* to load thumbnails in as the user is scrolling.
*/
ResultsView.prototype.initLazyLoad = function() {
  if (this.currentLazyLoad) {
    this.currentLazyLoad.destroy();
  }
  var resultsView = this;
  this.currentLazyLoad = $(".lazyLoad").Lazy({
    asyncLoader: function (element, completion) {
      var result = resultsView.currentResults[element.attr('data-idx')];
      if (result._thumbnails && result._thumbnails.length > 0) {
        // Thumbnail already exists...load now!
        console.log("Thumbnail exists for "+result._id);
        element.prepend("<img class=\"image-preview\"src=\""+girder.rest.apiRoot+"/file/" + result._thumbnails[0]+"/download"+"\">")
        completion(true);
      } else {
        console.log("No thumbnail for "+result._id);
        resultsView.createThumbnail(result._id, function(thumbnailFileId, updatedItem) {
          // Replace item in currentResults with the updated item and add the image
          resultsView.currentResults[element.attr('data-idx')] = updatedItem;
          element.prepend("<img class=\"image-preview\"src=\""+girder.rest.apiRoot+"/file/" + thumbnailFileId +"/download"+"\">")
        }, function (error) {
          element.prepend("<p>No Thumbnail Available.</p>");
        });
      }
    },
    effect: 'fadeIn',
    visibleOnly: true,
    appendScroll: $('#results-table-div').first(),
    chainable: false, // causes .Lazy to return the Lazy instance for later modification
    enableThrottle: true,
    throttle: 1000
  })
  this.currentLazyLoad.update(true);
}

/*
 * Helper function for creating a thumbnail in the case that
 * a thumbnail does not already exist.
 *
 * Arguments
 *   - itemID: item ID which needs thumbnail
 *   - completion: function taking two Arguments
 *      1. newly created thumbnail file ID
 *      2. updated item as returned by girder
 *
 *   - failure: function taking one argument (the error)
 */
ResultsView.prototype.createThumbnail = function (itemId, completion, failure) {
  var resultsView = this;
  girder.rest.restRequest({
    path: 'item/'+itemId+"/files"
  }).done (function (files) {
    var image = files.find(function (file) {
      return file.exts && file.exts.length > 0 && config.thumbnail_formats.includes(file.exts[file.exts.length-1].toLowerCase());
    });
    if (image) {
      girder.rest.restRequest({
        'path': 'thumbnail',
        'data': {
          'fileId': image._id,
          'width': '100',
          'height': '100',
          'attachToId': itemId,
          'attachToType': 'item'
        },
        'type': 'POST'
      }).done(function (resp) {
        console.log("Created thumbnanil job: "+JSON.stringify(resp));
        setTimeout(resultsView.retryItemUntilHasThumbnail.call(resultsView, itemId, function (updatedItem) {
          console.log("Thumbnail ID found for item: "+itemId);
          completion(updatedItem._thumbnails[0], updatedItem);
        }), 500);
      }).fail(failure);
    }
  })
}

/*
 * Helper function for checking every 1.0s to see if thumbnail creation
 * has completed.
 *
 * Arguments
 *   - itemID: item ID which should be checked for thumbnail
 *   - completion: function taking one argument, the updated item
 *     as returned by girder
 */
ResultsView.prototype.retryItemUntilHasThumbnail = function (itemID, completion) {
  var resultsView = this;
  girder.rest.restRequest({
    'path': 'item/'+itemID
  }).done(function (item) {
    if (item._thumbnails && item._thumbnails.length > 0) {
      completion(item);
    } else {
      setTimeout(resultsView.retryItemUntilHasThumbnail.call(resultsView, itemID, completion), 1000);
    }
  })
}

/*
 * Perform the query specified by generateQueryString() using this.currentOffset.
 * This query will consider all selected filters as well as the selected region.
 */
ResultsView.prototype.query = function () {
  var resultsView = this;
  $("#results-query-status").toggle(true);

  // Get the query object from the filter component and add the geo query parts
  var queryString = resultsView.generateQueryString();

  console.log("[ResultsView] Querying for results "+(this.currentOffset+1)+" - "+(this.currentOffset + search_limit));

  var thisOffset = resultsView.currentOffset; // This should be a copy
  girder.rest.restRequest({
    path: 'item/geospatial',
    data:{
      q: queryString,
      limit: search_limit,
      offset: this.currentOffset
    },
    error: null
  }).done(function(resp) {
    if (!resultsView.active) return;
    if (queryString != resultsView.generateQueryString()) {
      console.log("ignoring response to old query");
      return;
    }
    if (resultsView.currentOffset != thisOffset) {
      console.log("ignoring response to wrong offset");
      return;
    }

    $("#results-query-status").toggle(false);

    resultsView.currentResults = resp;
    resultsView.renderResults();

  })
}

/*
 * Perform sampling with the given offset. Sampling does NOT consider metadata filters, only geo.
 */
ResultsView.prototype.sample = function (offset) {
  var limit = 1000;
  console.log("[Results] Sample at offset "+offset+" (limit "+limit+")");
  $("#results-sample-status").toggle(true);


  girder.rest.restRequest({
    path: 'item/geospatial',
    data:{
      q: JSON.stringify(this.geoQuery),
      limit: limit,
      offset: offset
    },
    error: null
  }).done(makeSampleResponseListener(this));

  function makeSampleResponseListener(resultsView) {
    return function (resp) {
      if (!resultsView.active) return;
      resultsView.samplingResults = resultsView.samplingResults.concat(resp);
      resultsView.filterComponent.fetchFilterInfoAndUpdate(resp);

      // Make the next request
      if (resp.length == limit) {
        resultsView.sample(offset + limit*5);
      } else if (offset >= limit*5 && offset % (limit*5) != (limit * 4)){
        resultsView.sample((offset % (limit*5)) + limit);
      } else {
        // Finished sampling
        console.log("Done sampling for ResultsView.");
        $("#results-sample-status").toggle(false);
      }
    }
  }
 }

/*
 * Generates MongoDB-compatible query string from the metadata filters and geoQuery
 */
 ResultsView.prototype.generateQueryString = function () {
   // Get the query object from the filter component and add the geo query parts
   var filterQuery = this.filterComponent.generateQueryObject();
   $.each(this.geoQuery, function (key, value) {
     filterQuery[key] = value;
   })

   return JSON.stringify(filterQuery);
 }

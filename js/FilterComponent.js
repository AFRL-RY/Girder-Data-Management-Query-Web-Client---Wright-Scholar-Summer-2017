/*
* FilterComponent.js - a FilterComponent modularizes the behavior of the filters panel
* that is present in both the heatmap and search results views. It renders components in
* the designated DOM element and attaches listeners. It provides a callback (onFilterUpdate)
* for when any of the filters are changed.
*/


/*
* Constructor:
* - rootElement: Element to render filters in
* - modalElement: ELement to render the "Edit Shown Filters" window content
* - ...
* - currentItems: Items that are alredy known to match the search results (not used?)
*/
function FilterComponent(rootElement, modalElement, selectedFilters, string_metadata_keys, numerical_metadata_keys, currentItems) {
  this.selectedFilters = selectedFilters;
  this.sliders = {};
  this.string_metadata_keys = string_metadata_keys || config.default_string_keys;
  this.numerical_metadata_keys = numerical_metadata_keys || config.default_numerical_keys;
  this.rootElement = rootElement;
  this.modalElement = modalElement;
  this.filterValues = {};
  this.filterInfo = {};

  this.fetchFilterInfoAndUpdate(currentItems);

  rootElement.find('#filters').off('change');
  rootElement.find('#filters').on('change', 'input.string-filter', this.toggleCheckbox.bind(this));

  modalElement.find('#field-list').off('change');
  modalElement.find('#field-list').on('change', 'input', this.toggleFieldVisible.bind(this))

  modalElement.find('#field-search').off('input');
  modalElement.find('#field-search').on('input', this.filterFiltersList.bind(this));

  rootElement.find('#results').off('shown.bs.modal');

}

/*
 * This is called by ResultsView when this FilterComponent is about to be destroyed.
 * (ResultsView and FilterComponent are not re-used between searches)
 *
 * This ensures that the objects will be properly destroyed by the Javascript
 * runtime and will eleminates the retain cycle.
 */
FilterComponent.prototype.cleanup = function () {
  // Cleanup sliders
  $.each(this.sliders, function (key, slider) {
    slider.destroy();
  });
  this.onFilterUpdate = null;

  // Cancel events
  this.rootElement.find('#filters').off('change');

  this.modalElement.find('#field-list').off('change');
  this.modalElement.find('#field-search').off('input');
  this.rootElement.find("#timestamp-min").off("dp.change");
  this.rootElement.find("#timestamp-max").off("dp.change");

}

/**
* Called when a filter checkbox is toggled. Updates selectedFilters
* for the correct key and updates the label in the UI
*
* Arguments
*   - evt: Click event generated when checkbox was clicked
*/
FilterComponent.prototype.toggleCheckbox = function(evt) {
  var target = $(evt.target);
  var key = target.attr("data-key");
  var value = target.attr("data-value");
  // Toggle filter state
  var selectedValues = this.selectedFilters[key];
  if (target.prop("checked")) {
    selectedValues.push(value);
  } else {
    selectedValues.splice(this.selectedFilters[key].indexOf(value), 1);
  }
  this.updateSelectedFilterLabel(key);
  this.updateResultsForFilters();
}


/*
 * Used to notify the interested party that the filters have been updated.
 * onFilterUpdate should be manually set on this FilterComponent.
 */
FilterComponent.prototype.updateResultsForFilters = function () {
  if (this.onFilterUpdate) {
    this.onFilterUpdate();
  }
}

/*
 * Updates the text that says "No filter applied" to tell which filters are applied
 */
FilterComponent.prototype.updateSelectedFilterLabel = function (key) {
  var selectedValues = this.selectedFilters[key];
  var rootElement = this.rootElement;
  var filterComponent = this;
  if (selectedValues.length > 0) {
    // The rendered list should say unspecified not "ResultsViewUnspecified";
    var friendlyList = selectedValues.map(function (a) {
      if (a == "ResultsViewUnspecified") return "Unspecified";
      var name = rootElement.find("#filter-label-"+filterComponent.escapeKey(key)+"-"+filterComponent.escapeKey(a)).attr("data-name")
      return name || a; // returns name if defined and 'a' otherwise
    });

    rootElement.find('#selectedFilters-' + this.escapeKey(key)).text(" - "+friendlyList.join(", "));
  } else {
    rootElement.find('#selectedFilters-' + this.escapeKey(key)).html(" - <i>No filter applied</i>");
  }
}

/*
 * Called on the slideStop event being emitted from any slider
 */
FilterComponent.prototype.sliderValueChanged = function() {
  this.updateResultsForFilters();
}

/*
 * Returns a single-dimensional array of strings representing metadata fields
 * in dot syntax.
 */
FilterComponent.prototype.findAllMetadataFields = function (prefix, meta) {
  if (meta instanceof Array) return [];
  var fields = [];

  var filterComponent = this;
  $.each(meta, function (key, value) {
    if (!value) return;
    if (typeof value != "object") {
      fields.push(prefix + key);
    } else {
      fields = fields.concat(filterComponent.findAllMetadataFields(prefix + key + ".", value));
    }
  })

  return fields;
}

FilterComponent.prototype.fetchFilterInfoAndUpdate = function (newItems) {
  var newFields = [];
  var filterComponent = this;

  if (!filterComponent.filterValues["baseParentId"]) {
    filterComponent.filterValues["baseParentId"] = [];
    filterComponent.filterInfo["baseParentId"] = {};
    newFields.push("baseParentId");
  }
  $.each(newItems, function (idx, item) {
    $.each(filterComponent.findAllMetadataFields("meta.", item.meta), function (idx, key) {
      var metaKey = key.substring(5);
      if (!newFields.includes(key) && filterComponent.filterValues[metaKey] === undefined && filterComponent.filterInfo[metaKey] === undefined) {
        // Need to fetch
        filterComponent.filterValues[metaKey] = []; // makes sure this won't be requested again later
        newFields.push(key);
      }
    })
  })

  $.each(newItems, function (idx, item) {
    var meta = item.meta;
    $.each(filterComponent.findAllMetadataFields("", meta), function (idx, key) {
      var value = Object.byString(meta, key);
      if (!filterComponent.filterInfo[key]) {
        filterComponent.filterInfo[key] = {};
      }
      if (typeof value == "number") return;
      if (value) {
        if (filterComponent.filterInfo[key][value]) {
          filterComponent.filterInfo[key][value]++;
        } else {
          filterComponent.filterInfo[key][value] = 1;
        }
      } else {
        if (filterComponent.filterInfo[key]["ResultsViewUnspecified"]) {
          filterComponent.filterInfo[key]["ResultsViewUnspecified"]++;
        } else {
          filterComponent.filterInfo[key]["ResultsViewUnspecified"] = 1;
        }
      }
    })

    if (!filterComponent.filterInfo["baseParentId"]) {
      filterComponent.filterInfo["baseParentId"] = {};
    }
    if (filterComponent.filterInfo["baseParentId"][item.baseParentId]) {
      filterComponent.filterInfo["baseParentId"][item.baseParentId]++;
    } else {
      filterComponent.filterInfo["baseParentId"][item.baseParentId] = 1;
    }
  })

  filterComponent.updateAvailableFilters()

  for (let key of newFields) {
    $.ajax(config.filterInfoEndpoint, {
      data: { field_names: [key] }
    }).done(function (response) {
      var values = response[key]
      if (key != "baseParentId") {
        var metaKey = key.substring(5);
        filterComponent.filterValues[metaKey] = values;
        if (!filterComponent.filterInfo[metaKey]) {
          filterComponent.filterInfo[metaKey] = {};
        }
        if (typeof values[0] == "number") {
          // Find the max and min of the known values
          for (var value of values) {
            var floatValue = parseFloat(value);
            if (!filterComponent.filterInfo[metaKey]["min"] || filterComponent.filterInfo[metaKey]["min"] > value) {

              filterComponent.filterInfo[metaKey]["min"] = floatValue;
            }
            if (!filterComponent.filterInfo[metaKey]["max"] || filterComponent.filterInfo[metaKey]["max"] < value) {
              filterComponent.filterInfo[metaKey]["max"] = floatValue;
            }
          }
        } else {
          // Initialize my histogram-like filterInfo dictionary
          $.each(values.concat("ResultsViewUnspecified"), function (idx, value) {
            if (!filterComponent.filterInfo[metaKey][value]) {
              filterComponent.filterInfo[metaKey][value] = 0;
            }
          })
        }
      } else {
        // For baseParentId
        filterComponent.filterValues["baseParentId"] = values;
        $.each(values, function (idx, value) {
          if (!filterComponent.filterInfo["baseParentId"][value]) {
            filterComponent.filterInfo["baseParentId"][value] = 0;
          }
        })
      }
      filterComponent.updateAvailableFilters();
    })
  }
    if (false) {
  $.ajax(config.filterInfoEndpoint, {
    data: {
      field_names: newFields
    }
  }).done(function (response) {
    console.log(response);
    $.each(response, function (key, values) {
      if (key != "baseParentId") {
        var metaKey = key.substring(5);
        filterComponent.filterValues[metaKey] = values;
        if (!filterComponent.filterInfo[metaKey]) {
          filterComponent.filterInfo[metaKey] = {};
        }
        if (typeof values[0] == "number") {
          // Find the max and min of the known values
          for (var value of values) {
            var floatValue = parseFloat(value);
            if (!filterComponent.filterInfo[metaKey]["min"] || filterComponent.filterInfo[metaKey]["min"] > value) {
              filterComponent.filterInfo[metaKey]["min"] = floatValue;
            }
            if (!filterComponent.filterInfo[metaKey]["max"] || filterComponent.filterInfo[metaKey]["max"] < value) {
              filterComponent.filterInfo[metaKey]["max"] = floatValue;
            }
          }
        } else {
          // Initialize my histogram-like filterInfo dictionary
          $.each(values.concat("ResultsViewUnspecified"), function (idx, value) {
            if (!filterComponent.filterInfo[metaKey][value]) {
              filterComponent.filterInfo[metaKey][value] = 0;
            }
          })
        }
      } else {
        // For baseParentId
        filterComponent.filterValues["baseParentId"] = values;
        if (filterComponent.filterInfo["baseParentId"]) return;
        filterComponent.filterInfo["baseParentId"] = {};
        $.each(values, function (idx, value) {
          if (!filterComponent.filterInfo["baseParentId"][value]) {
            filterComponent.filterInfo["baseParentId"][value] = 0;
          }
        })
      }
    })

    filterComponent.updateAvailableFilters()
  })
}
}

/**
* Loops through the numerical and string filter fields
* specified by string_metadata_keys and numerical_metadata_keys,
* and creates <input> elements to filter for each field value
*/
FilterComponent.prototype.updateAvailableFilters = function() {
  var filterComponent = this;
  var allFields = [];
  var filterInfo = filterComponent.filterInfo;

  /* Populate filterInfo based on data in 'items' */

  // Create a blank entry in the filterInfo dictionary for each key

  // Go ahead and make an entry in the info dictionary for the selected filters
  // This is so that selected filters get a checkbox so they can be deselected even if there was
  // nothing matching the filter.

  for (var key of Object.keys(filterComponent.filterValues)) {
    var value = filterComponent.filterValues[key][0];
    if (value && !allFields.includes(key) && key !== config.timestamp_key && key !== "baseParentId" && (value.constructor == String || value.constructor == Number)) {
      allFields.push(key);
    }
  }

  /*
   * String filters: Render a bootstrap panel with a checkbox for each string metadata value
   */
  $.each(filterComponent.string_metadata_keys.concat(["baseParentId"]), function (idx, key) {
    var name = (key === "baseParentId") ? "Girder Collection" : key; // Use friendly name "Girder Collection" not baseParentId
    var reselectValues = filterComponent.selectedFilters[key] || []; // Values which will be re-checked once we re-render the checkboxes
    var escapedKey = filterComponent.escapeKey(key);

    var prefix = filterComponent.rootElement.attr("id"); // Prefix used on some elements for uniqueness (fixes panel collapsing)

    // If a panel does not already exist, create one
    if (filterComponent.rootElement.find("#"+prefix+"-collapse-"+escapedKey).length == 0) {
      var filterControls = "<div class=\"form-group filter-group\"><div class=\"panel panel-default\">\
      <div class=\"panel-heading\" role=\"tab\" id=\"heading-" + key +"\" data-toggle=\"collapse\" data-parent=\"#accordion\" href=\"#"+prefix+"-collapse-" + escapedKey +"\" aria-expanded=\"false\" aria-controls=\""+prefix+"-collapse-" + key +"\">\
      <h4 class=\"panel-title\">\
      <a><b>" + name + "</b><span id=\"selectedFilters-" + key +"\"> - <i>No filter applied</i></span><span class=\"filter-caret caret\"></span> </a>\
      </h4>\
      </div>\
      <div id=\"" + prefix + "-collapse-" + key + "\" class=\"panel-collapse collapse\" role=\"tabpanel\" aria-labelledby=\"heading-" + key + "\">\
      <div class=\"panel-body\"></div></div></div></div>"

      filterComponent.rootElement.find('#filters').append(filterControls);
    }

    var filterControls = "";

    // Each possible field value is displayed in order
    var sortedValues = [];
    if (filterInfo[key]) {
      sortedValues = Object.keys(filterInfo[key]).sort(function(a, b) {
        if (filterInfo[key][a] < filterInfo[key][b]) {
          return 1;
        } else if (filterInfo[key][a] > filterInfo[key][b]) {
          return -1;
        } else return 0;
      });
    }

    // Add a checkbox for each value
    $.each(sortedValues, function (idx, value) {
      var name = value;
      if (value == "ResultsViewUnspecified") name = "<i>Not Specified</i>"; // Show friendly 'Not Specified' instead of internal keyword

      filterControls += "<div class=\"checkbox";
      if (idx >= 5) {
        filterControls += " checkbox-overflow-" + key + "\" style=\"display:none;";
      }
      var selected = reselectValues.includes(value);
      filterControls += "\"><label><input class=\"string-filter\" type=\"checkbox\" data-key=\"" + key + "\" data-value=\"" + value + "\" "+(selected ? "checked" : "")+"><span id=\"filter-label-"+key+"-"+value+"\">" + name + " - " + filterInfo[key][value] + "</span></label></div>";

      // IF (and only if) these checkboxes are for Girder Collections, send a API request to get the collection name
      function makeCollectionNameFoundListener(selector, count) {
        return function (res) {
          filterComponent.rootElement.find(selector).text(res.name + " - " + count);
          filterComponent.rootElement.find(selector).attr("data-name", res.name);
          filterComponent.updateSelectedFilterLabel(key)
        }
      }
      if (key === "baseParentId") {
        girder.rest.restRequest({
          path: "/collection/"+value
        }).done(makeCollectionNameFoundListener("#filter-label-"+escapedKey+"-"+value, filterInfo[key][value]));
      }
    });

    // If there were more than five values, add a "Show more" button
    if (sortedValues.length > 5) {
      filterControls += "<a href=\"#\" class=\"show-more\" data-key=\""+key+"\">Show More</a>";
    }

    // Replace the contents of the panel body with the new contents
    var panelBody = filterComponent.rootElement.find("#"+prefix+"-collapse-"+escapedKey+" > div");
    panelBody.empty();
    panelBody.append(filterControls);

    // If there were no currently selected filters, initialize with []
    if (!filterComponent.selectedFilters[key]) {
      filterComponent.selectedFilters[key] = [];
    }
    filterComponent.updateSelectedFilterLabel(key);
  })

  // Add an onClick listener for the "Show more" buttons
  filterComponent.rootElement.find('.show-more').click(function(evt) {
    var target = $(evt.target);
    // Toggle the visibility of the additional field values, and update the button text
    filterComponent.rootElement.find('.checkbox-overflow-'+filterComponent.escapeKey(target.attr('data-key'))).toggle();
    target.text("Show "+( target.text() == "Show More" ? "Less" : "More" ));
  })

  /*
   * Numerical filters: Render a slider for each one
   */
  $.each(filterComponent.numerical_metadata_keys, function (idx, key) {
    if (!filterInfo[key]) return;
    var escapedKey = filterComponent.escapeKey(key);
    var prefix = filterComponent.rootElement.attr("id");

    // Add the slider to the DOM if not present
    if (filterComponent.rootElement.find("#"+prefix+"-slider-"+escapedKey).length == 0) {
      var filterControls = "<div class=\"form-group filter-group\">";
      filterControls += "<div class=\"slider\"><label>" + key + "</label><br><input id=\"" + prefix + "-slider-" + key + "\" type=\"text\"/></div>";
      filterControls += "</div>";
      filterComponent.rootElement.find('#filters').append(filterControls);
    }

    // Compute the mix/max value for the slider. Use previously selected value if previously modified.
    var min = Math.floor(parseFloat(filterInfo[key]["min"])) || -99999999, max = Math.ceil(parseFloat(filterInfo[key]["max"])) || 99999999;
    var oldSlider = filterComponent.sliders[key];

    var reselectValues = [min, max];
    if (oldSlider && (oldSlider.getValue()[0] != oldSlider.options.min || oldSlider.getValue()[1] != oldSlider.options.max) ) {
      reselectValues = oldSlider.getValue();
    }
    if (isNaN(reselectValues[0]) || isNaN(reselectValues[1]) || reselectValues[0] < min || reselectValues[1] > max) reselectValues = [min, max];

    // Create a new slider, setting the current value to the old slider's value
    if (oldSlider) oldSlider.destroy();
    var slider = new Slider("#" + prefix + "-slider-"+escapedKey, { id: prefix+"-slider-"+key, min: min, max: max, range: true, value: reselectValues })
    slider.on("slideStop", filterComponent.sliderValueChanged.bind(filterComponent));
    filterComponent.sliders[key] = slider;

    // Some fixes to prevent the whole control box from sliding around when sliding the slider
    $("#" + prefix + "-slider-"+escapedKey).on("mousedown", function (evt) {
      evt.stopPropagation()
    });

    $("#" + prefix + "-slider-"+escapedKey).on("mouseup", function (evt) {
      evt.preventDefault()
    });

    if (!filterInfo[key]["min"]) {
      slider.disable();
    }
  })

  /* Timestamp filters */
  if (filterComponent.rootElement.find("#timestamp-min").length == 0) {
    this.setupTimestampInputs();
  }

  var dateSelection = filterComponent.selectedFilters[config.timestamp_key]
  if (dateSelection) {
     filterComponent.rootElement.find('#timestamp-min').data("DateTimePicker").date(moment(dateSelection.min));
     filterComponent.rootElement.find('#timestamp-max').data("DateTimePicker").date(moment(dateSelection.max));
  }

  // Populate the field list so the user can select any of the metadata fields
  filterComponent.modalElement.find('#field-list').empty();

  allFields.sort(function (a, b) {
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  })

  $.each(allFields, function (idx, fieldName) {
    var checkbox = "<label style=\"display:block;\"><input type=\"checkbox\" data-key=\"" + fieldName + "\"";
    if (filterComponent.string_metadata_keys.includes(fieldName) || filterComponent.numerical_metadata_keys.includes(fieldName)) {
      checkbox += " checked";
    }
    checkbox += ">" + fieldName+ "</label>";
    filterComponent.modalElement.find('#field-list').append(checkbox);
  })

  filterComponent.filterFiltersList();
}

/*
 * Adds the date/time inputs to the filters panel, and initializes them with
 * jQuery datetimepicker plugin.
 */
FilterComponent.prototype.setupTimestampInputs = function () {
  var filterComponent = this;
  // Timestamp filter (using calendar)
  filterComponent.rootElement.find('#filters').append( "<div class=\"form-group filter-group\">\
  <div class=\"input-group date\">\
  <input type=\'text\' id=\"timestamp-min\" class=\"form-control\" />\
  <span class=\"input-group-addon\">\
  <span class=\"glyphicon glyphicon-calendar\"></span>\
  </span></div>\
  <div class=\"input-group date\">\
  <input type=\'text\' id=\"timestamp-max\" class=\"form-control\" />\
  <span class=\"input-group-addon\">\
  <span class=\"glyphicon glyphicon-calendar\"></span>\
  </span></div></div>")

  filterComponent.rootElement.find('#timestamp-min').datetimepicker({
    showClose: true,
    showClear: true
  });
  filterComponent.rootElement.find('#timestamp-max').datetimepicker({
    useCurrent: false, //Important! See issue #1075
    showClose: true,
    showClear: true
  });

  filterComponent.rootElement.find("#timestamp-min").on("dp.change", function (e) {
    var maxPicker = filterComponent.rootElement.find('#timestamp-max').data("DateTimePicker");
    maxPicker.minDate(e.date);
    filterComponent.selectedFilters[config.timestamp_key] = {max: maxPicker.date(), min: e.date};
    filterComponent.updateResultsForFilters();
  });

  filterComponent.rootElement.find("#timestamp-max").on("dp.change", function (e) {
    var minPicker = filterComponent.rootElement.find('#timestamp-min').data("DateTimePicker")
    minPicker.maxDate(e.date);
    filterComponent.selectedFilters[config.timestamp_key] = {min: minPicker.date(), max: e.date};
    filterComponent.updateResultsForFilters();
  });
}

/**
* Called when a field name is checked or unchecked in the "Edit Fields" pane
*/
FilterComponent.prototype.toggleFieldVisible = function (evt) {
  var target = $(evt.target);
  var key = target.attr("data-key");
  if (target.prop("checked")) {
    var isString = !(typeof this.filterValues[key] == "number");

    if (isString) this.string_metadata_keys.push(key);
    else this.numerical_metadata_keys.push(key);
  } else {
    var idx = this.string_metadata_keys.indexOf(key);
    if (idx > -1) this.string_metadata_keys.splice(idx, 1);
    idx = this.numerical_metadata_keys.indexOf(key);
    if (idx > -1) this.numerical_metadata_keys.splice(idx, 1);
  }
  this.updateAvailableFilters()
}

/* Creates a MongoDB-compatible query object given the selected filters
*
*/
FilterComponent.prototype.generateQueryObject = function () {
  var query = {};

  // Numerical Filters
  for (var key of this.numerical_metadata_keys) {
    // Get slider value
    if (!this.sliders[key]) continue;
    var sliderValue = this.sliders[key].getValue();
    var min = sliderValue[0], max = sliderValue[1];
    // Only filter if the filter is set to something other than its min/max values
    if (isNaN(min) || isNaN(max) || ( min == this.sliders[key].options.min && max == this.sliders[key].options.max ) ) continue;

    query["meta."+key] = {"$gte": min, "$lte": max};
  }
  // String filters
  for (var key of this.string_metadata_keys) {
    if (!this.selectedFilters[key]) continue;

    var validValues = this.selectedFilters[key].slice();
    if (validValues.length === 0) continue;
    var unspecifiedIdx = validValues.indexOf("ResultsViewUnspecified");
    if (unspecifiedIdx != -1) {
      validValues[unspecifiedIdx] = null; // mongodb should include items on which this field is not defined or is null
    }
    query["meta."+key] = {"$in": validValues};
  }

  // Girder Collection
  var validCollectionStrings = this.selectedFilters["baseParentId"];
  if (validCollectionStrings && validCollectionStrings.length > 0) {
    var validCollections = validCollectionStrings.map(function (id) {
      return {"$oid": id};
    });
    query["baseParentId"] = {"$in": validCollections};
  }

  // Timestamp
  var dateState = this.selectedFilters[config.timestamp_key]
  if (dateState && dateState.min && dateState.max) {
    query["meta."+config.timestamp_key] = {"$gte": moment(dateState.min).unix(), "$lte": moment(dateState.max).unix()};
  }

  return query;
}

/**
* Called when something is typed into the search field in the filters list
*
*/
FilterComponent.prototype.filterFiltersList = function (evt) {
  var search = this.modalElement.find("#field-search").val().toLowerCase();
  this.modalElement.find('#field-list input').each(function (idx, fieldCheckbox) {
    var fieldCheckbox = $(fieldCheckbox);
    var key = fieldCheckbox.attr("data-key");
    // Hide/show checkbox+label based on matching
    if (key.toLowerCase().indexOf(search) == -1) {
      fieldCheckbox.parent().css('display', 'none');
    } else {
      fieldCheckbox.parent().css('display', 'block');
    }
  })
}

/*
 * Returns a properly escaped version of a metatdata key that can be used as part of
 * a jQuery selector.
 */
FilterComponent.prototype.escapeKey = function(key) {
  return CSS.escape(key);
  // return key.replace(".", "\\.").replace("/", "\\/").replace("@", "\\@").replace(":", "\\:");
}

// Deep object property accessor
// Ex. Object.byString({"hi": {"bob": 1}}, "hi.bob") --> 1
// https://stackoverflow.com/questions/6491463/accessing-nested-javascript-objects-with-string-key
Object.byString = function(o, s) {
   s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
   s = s.replace(/^\./, '');           // strip a leading dot
   var a = s.split('.');
   for (var i = 0, n = a.length; i < n; ++i) {
       var k = a[i];
       if (k in o) {
           o = o[k];
       } else {
           return;
       }
   }
   return o;
}

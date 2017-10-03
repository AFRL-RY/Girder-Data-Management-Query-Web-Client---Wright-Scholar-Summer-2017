var config = {
  "default_string_keys": ["platform", "sensorModality"], // field names shown by default (as checkboxes)
  "default_numerical_keys": ["frame_data.sensor_altitude"], // field names shown by default (as a slider control)
  "girder_root": "http://10.104.6.45:8080/",
  "filterInfoEndpoint": "http://10.104.6.45:8000/distinct",
  "thumbnail_formats": ["png", "tif", "tiff"], // Thumbnail generation will be attempted for items with files of these extensions
  "timestamp_key": "timeInMilliseconds", // Key to be used for timestamp (date/time picker)
  "osmOnline": false, // set to false to use /tiles/{z}/{x}/{y}.png
  "heatmap_sample_limit": 1000, // number of items to fetch with each heatmap sample query
  "heatmap_radius": 10, // radius for the heatmap dots
  "heatmap_blur_radius": 15, // blur radius for the heatmap dots
  "bin_decimal_places": 2 // decimal places to round when binning points for heatmap
}

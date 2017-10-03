Imagery-Viewer
===============

Web interface for running geospatial queries on a [Girder](http://github.com/girder/girder) database.

![](http://i.imgur.com/W8RsJjW.png)
![](http://i.imgur.com/mjF8J4G.png)

Installation
-----------

- Dependencies are managed with [Bower](https://github.com/bower/bower).
  - `bower.json` lists dependencies, which are installed in `bower_components/`
The `bower_components/` directory is included in the Git repository, therefore you should *not* have to run bower, but if you needed to update dependencies for some reason, you would run:
    ```bash
    # install bower
    apt-get install nodejs npm
    npm install -g bower
    # run bower in root project directory
    bower install
    ```
- The root project directory should be hosted on a web server such as apache or nginx
- The project can be compiled into a docker image by running `docker build` in the root project directory. Beware that this will include all of the map tiles and will be a large (1.5+ GB) file after its long build time.

Configuration
------------

- `index.html` references the girder instance URL for 3 JS/CSS files which are needed for the application.
  - `localhost:8080` should be replaced by the URL for the girder instance this application should access
- `main.js` has one reference to `localhost:8080` in the "constants" section at the top of the file. This should be replaced by the URL for the girder instance the application should access.



Aquisition of Map Tiles
-----------

[JTileDownloader](http://wiki.openstreetmap.org/wiki/JTileDownloader) was used to download OpenStreetMap tiles using the [Wikimedia Maps tile server](http://wiki.openstreetmap.org/wiki/Tile_servers). Zoom levels 0-9 were downloaded which totals ~1.5 GB. The `tiles/` directory created by JTileDownloader should be copied into the root project directory.

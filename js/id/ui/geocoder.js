iD.geocoder = function() {

    var map;

    function geocoder(selection) {
        function keydown() {
            if (d3.event.keyCode !== 13) return;
            d3.event.preventDefault();
            d3.json('http://api.tiles.mapbox.com/v3/mapbox/geocode/' +
                encodeURIComponent(this.value) + '.json', function(err, resp) {
                hide();
                map.center([resp.results[0][0].lon, resp.results[0][0].lat]);
            });
        }

        function clickoutside(selection) {
            selection
                .on('click.geocoder-inside', function() {
                    return d3.event.stopPropagation();
                });
            d3.select('body').on('click.geocoder-outside', hide);
        }

        function show() { setVisible(true); }
        function hide() { setVisible(false); }
        function toggle() { setVisible(gcForm.classed('hide')); }

        function setVisible(show) {
            button.classed('active', show);
            gcForm.classed('hide', !show);
            if (show) d3.select('.map-overlay input').node().focus();
            else map.surface.node().focus();
        }

        var button = selection.append('button')
            .attr('class','narrow')
            .html('<span class=\'geocode icon\'></span>')
            .on('click', toggle);

        var gcForm = selection.append('form');

        gcForm.attr('class','content map-overlay hide')
            .append('input')
                .attr({ type: 'text', placeholder: 'find a place' })
                .on('keydown', keydown);

        selection.call(clickoutside);
    }

    geocoder.map = function(_) {
        if (!arguments.length) return map;
        map = _;
        return geocoder;
    };

    return geocoder;
};

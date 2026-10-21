import { select } from 'd3-selection';
import { PbfWriter } from 'pbf';

// A single point at the center of its tile, using the public Mapilio schema.
function imageTile(properties) {
    const tile = new PbfWriter();
    tile.writeMessage(3, (props, layer) => {
        const entries = Object.entries(props);
        layer.writeStringField(1, 'map_points');
        layer.writeMessage(2, (_, feature) => {
            feature.writePackedVarint(2, entries.flatMap((_, i) => [i, i]));
            feature.writeVarintField(3, 1);
            feature.writePackedVarint(4, [9, 4096, 4096]);
        }, null);
        for (const [key, value] of entries) {
            layer.writeStringField(3, key);
            layer.writeMessage(4, (v, field) => {
                if (typeof v === 'number') field.writeVarintField(5, v);
                else field.writeStringField(1, v);
            }, value);
        }
        layer.writeVarintField(5, 4096);
        layer.writeVarintField(15, 2);
    }, properties);
    return tile.finish();
}

describe('iD.serviceMapilio', function() {
    let mapilio, context, container, centerEase, originalHash;

    beforeAll(async () => {
        originalHash = window.location.hash;
        mapilio = iD.serviceMapilio;
        mapilio.init();
        container = select(document.body).append('div');
        container.append('div').attr('class', 'photoviewer');
        centerEase = vi.fn();
        context = {
            container: () => container,
            asset: path => path,
            ui: () => ({ photoviewer: { on: () => {} } }),
            map: () => ({ centerEase })
        };
        const loaded = mapilio.ensureViewerLoaded(context);
        document.querySelector('#ideditor-mapilio-viewercss').dispatchEvent(new Event('load'));
        document.querySelector('#ideditor-mapilio-viewerjs').dispatchEvent(new Event('load'));
        await loaded;
    });

    beforeEach(() => {
        mapilio.reset();
        mapilio.setActiveImage();
        centerEase.mockClear();
    });

    afterEach(() => {
        mapilio.on('loadedImages.test', null);
        container.selectAll('*').interrupt();
        vi.restoreAllMocks();
    });

    afterAll(() => {
        mapilio.reset();
        mapilio.setActiveImage();
        window.history.replaceState(null, '', originalHash);
        container.remove();
        document.querySelector('#ideditor-mapilio-viewercss').remove();
        document.querySelector('#ideditor-mapilio-viewerjs').remove();
    });

    it('parses capture dates from vector tiles for marker ordering', async () => {
        const body = imageTile({
            id: 42,
            sequence_uuid: 'sequence-a',
            capture_time: '2023-08-14T19:14:41Z',
            created_by_id: 449,
            heading: 90,
            resolution: '4032x2268'
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(body)));
        const projection = iD.geoRawMercator()
            .scale(iD.geoZoomToScale(14))
            .translate([-116508, 0])
            .clipExtent([[0, 0], [64, 64]]);
        const loaded = new Promise(resolve => { mapilio.on('loadedImages.test', resolve); });

        mapilio.loadImages(projection);
        await loaded;

        const image = mapilio.cachedImage(42);
        expect(image.capture_time_parsed).toBeInstanceOf(Date);
        expect(image.capture_time_parsed.toISOString()).toBe('2023-08-14T19:14:41.000Z');
    });

    it('exposes the selected image to the marker renderer and clears it', () => {
        mapilio.setActiveImage({ id: 42, sequence_id: 'sequence-a' });
        expect(mapilio.getActiveImage()).toEqual({ id: 42, sequence_id: 'sequence-a' });

        mapilio.setActiveImage();
        expect(mapilio.getActiveImage()).toBeNull();
    });

    it.each([undefined, 404])('handles an uncached image %s when zooming out', id => {
        const hash = window.location.hash;
        expect(() => mapilio.selectImage(context, id)).not.toThrow();
        expect(window.location.hash).toBe(hash);
    });

    it.each(['back', 'forward'])('does not navigate past the %s boundary', direction => {
        mapilio.setActiveImage({ id: 42, sequence_id: 'sequence-a' });
        const button = container.select(`button.${direction}`);
        const handler = button.on(`click.${direction}`);

        expect(() => handler()).not.toThrow();
        expect(centerEase).not.toHaveBeenCalled();
    });

    it('still opens an adjacent cached image', async () => {
        mapilio.cache().images.forImageId[43] = {
            id: 43,
            sequence_id: 'sequence-a',
            created_by_id: 449,
            capture_time: '2023-08-14T19:14:41Z',
            loc: [10, 0],
            isPano: false
        };
        vi.spyOn(globalThis, 'fetch').mockImplementation(url => Promise.resolve(new Response(JSON.stringify({
            data: String(url).includes('/search-user')
                ? [{ username: 'mapper' }]
                : [{ id: 43, filename: 'image.jpeg', uploaded_hash: 'image-hash' }]
        }))));
        mapilio.setActiveImage({ id: 42, sequence_id: 'sequence-a' });

        container.select('button.forward').on('click.forward')();

        await vi.waitFor(() => {
            expect(container.select('#ideditor-viewer-mapilio-simple img').attr('src'))
                .toBe('https://cdn.mapilio.com/im/image-hash/image.jpeg/1080');
        });
        expect(centerEase).toHaveBeenCalledWith([10, 0]);
        expect(window.location.hash).toContain('photo=mapilio/43');
    });
});

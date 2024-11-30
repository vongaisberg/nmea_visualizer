// Haversine distance calculation between two coordinates
const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Print float coordinates human readably
const printCoordinates = (lat, lon) => {
    const latDir = lat < 0 ? 'S' : 'N';
    const lonDir = lon < 0 ? 'W' : 'E';
    const latStr = `${Math.abs(lat).toFixed(6)}° ${latDir}`;
    const lonStr = `${Math.abs(lon).toFixed(6)}° ${lonDir}`;
    return `${latStr}, ${lonStr}`;
}

// Extract the first GeoJSON feature from an NMEA file
const firstNMEA = (nmea) => {
    const startTime = Date.now();
    const lines = nmea.split('\n');

    for (const line of lines) {
        const fields = line.split(',');

        if (fields[0] === '$GNRMC') {
            let lat = parseFloat(fields[3].slice(0, 2)) + parseFloat(fields[3].slice(2)) / 60;
            let lon = parseFloat(fields[5].slice(0, 3)) + parseFloat(fields[5].slice(3)) / 60;

            // Adjust for southern or western hemispheres
            if (fields[4] === 'S') lat = -lat;
            if (fields[6] === 'W') lon = -lon;

            const feature = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: [[lon, lat]]
                }
            };

            console.log(`Elapsed time: ${Date.now() - startTime}ms`);
            return feature;
        }
    }
};

// Parse an NMEA file and generate GeoJSON data
const loadNMEA = (nmea, mooringDistance, mooringTime) => {
    const lines = nmea.split('\n');

    let totalPoints = 0;
    let renderedPoints = 0;
    let lastLat = 0, lastLon = 0, lastTimestamp = 0;
    let stationaryFor = 0, moored = false;

    const lineFeature = {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'LineString',
            coordinates: []
        }
    };

    const markers = [];

    for (const line of lines) {
        const fields = line.split(',');

        if (fields[0] === '$GNRMC') {
            totalPoints++;

            // Extract timestamp
            const [hours, minutes, seconds] = [fields[1].slice(0, 2), fields[1].slice(2, 4), fields[1].slice(4, 6)];
            const [day, month, year] = [fields[9].slice(0, 2), fields[9].slice(2, 4), fields[9].slice(4, 6)];
            const timestamp = new Date(`20${year}`, month - 1, day, hours, minutes, seconds).getTime();

            // Extract latitude and longitude
            let lat = parseFloat(fields[3].slice(0, 2)) + parseFloat(fields[3].slice(2)) / 60;
            let lon = parseFloat(fields[5].slice(0, 3)) + parseFloat(fields[5].slice(3)) / 60;

            // Adjust for southern or western hemispheres
            if (fields[4] === 'S') lat = -lat;
            if (fields[6] === 'W') lon = -lon;

            // Calculate distance and time difference
            const dist = haversineDistance(lastLat, lastLon, lat, lon);
            const duration = timestamp - lastTimestamp;

            if (dist < mooringDistance) {
                stationaryFor++;
            } else {
                stationaryFor = 0;
                lastLat = lat;
                lastLon = lon;
                lastTimestamp = timestamp;

                if (moored) {
                    moored = false;
                    if (markers.length > 0) {
                        markers[markers.length - 1][3] = timestamp;
                    }
                }
            }

            if (stationaryFor > 60 * mooringTime && !moored) {
                moored = true;

                markers.push([lastLon, lastLat, timestamp, 0]);
                // Trim the last mooringTime worth of coordinates
                lineFeature.geometry.coordinates = lineFeature.geometry.coordinates.slice(0, -60 * mooringTime);
            }

            if (!moored) {
                lineFeature.geometry.coordinates.push([lon, lat]);
                renderedPoints++;
            } else {
                // Smooth coordinates for moored positions
                lastLon = (lastLon * 99 + lon) / 100;
                lastLat = (lastLat * 99 + lat) / 100;
            }
        }
    }

    return [lineFeature, markers, { totalPoints, renderedPoints }];
};
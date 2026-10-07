# 3D Earth

**3D Earth** is a browser-based planetary observatory built around a simple rule: **the Earth stays visible, while data explains the place.**

The project is intentionally being rebuilt as a real functional system rather than a decorative globe. The current foundation combines a deterministic Three.js Earth renderer, astronomical solar geometry, live orbital elements propagated with SGP4, an OpenStreetMap view, device geolocation, geographic timezone data, and a mobile-first navigation system.

**Built by Kweezi Perez** — https://kweeziperez.com

## Current implemented foundation

### Planetary renderer
- Three.js r128 WebGL renderer.
- Real local Earth day texture, normal map, specular map, night-light texture and cloud texture.
- Atmospheric rim, Moon and star field.
- Deterministic solar geometry updates Earth lighting and the day/night terminator.
- Orbit controls work with mouse, touch and trackpad gestures.
- Mandatory local Earth assets are loaded before the first meaningful frame.
- Satellite failure is isolated from planetary rendering.

### Astronomy and time
- Solar altitude and azimuth are calculated from UTC time and WGS84 latitude/longitude.
- Day/night state is derived from calculated solar altitude.
- Geographic timezone is requested for the selected observer coordinate and displayed as an IANA timezone where supplied.
- Local time uses the browser timezone-aware Intl.DateTimeFormat.
- No longitude-only timezone approximation is used.

### Real satellite tracking
Orbital objects are sourced from **CelesTrak GP element sets** and propagated with satellite.js.

Supported live groups:
- Stations
- Weather
- GPS
- Science
- Starlink
- Active catalogue

For rendered objects the application calculates:
- current geodetic position,
- altitude,
- velocity magnitude,
- trajectory over the surrounding 90-minute window,
- NORAD catalogue number.

Selecting an object requests its CelesTrak SATCAT record for catalogue metadata such as ownership, launch date, orbital period, inclination, apogee and perigee when available.

The interface records source and fetch time. It does **not** claim NASA is the live orbital-elements authority for every satellite. NASA mission information can provide mission context; current orbital propagation requires current orbital elements from an orbital catalogue/provider.

### OpenStreetMap map
/map.html opens at a world view by default.

The map uses the standard OpenStreetMap tile endpoint with visible attribution. It does not prefetch or bulk-download tiles.

The **Locate Me** flow:
1. Requests browser high-accuracy geolocation.
2. Uses the device's reported latitude, longitude, timestamp and accuracy.
3. Zooms to the reported position.
4. Displays a private marker and accuracy circle.
5. Keeps the location in sessionStorage for the current browser session.
6. Shares the same location state with the globe.

**Accuracy is never fabricated.** A browser/device may report 3 m, 20 m, 100 m or worse. The UI displays the actual reported accuracy. Ordinary browser geolocation cannot honestly guarantee 1-metre survey accuracy; 1-metre-grade positioning generally requires suitable GNSS/RTK hardware and correction services.

### Mobile-first experience
The site uses an iPhone-style, thumb-reachable bottom navigation on small screens with safe-area handling.

Primary mobile destinations:
- Home
- Globe
- Map
- Satellites
- About

## Privacy model for exact location

Exact device location is sensitive.

3D Earth therefore:
- requests location only after user action,
- uses the browser permission model,
- keeps the exact coordinate in the browser session,
- does not create a public location URL,
- does not publish the marker to other users,
- displays device-reported accuracy instead of inventing precision,
- allows the user to clear local location state.

Some location-dependent services necessarily receive coordinates when their functionality is used. Those third-party providers have their own policies. See /privacy.html and /data-policy.html.

## Architecture

~~~text
Browser
  │
  ├── Three.js planetary renderer
  │    ├── local Earth assets
  │    ├── solar geometry
  │    ├── Moon / atmosphere / clouds / stars
  │    └── SGP4 satellite propagation
  │
  ├── OpenStreetMap + Leaflet
  │    └── private device-location state
  │
  └── REST gateway
       ├── CelesTrak GP orbital elements
       ├── CelesTrak SATCAT metadata
       ├── Open-Meteo geographic timezone/weather response
       └── Nominatim reverse geocoding where explicitly used
~~~

The repository also contains existing server-side ingestion and analyst infrastructure. Those features are being reconnected only when their data contracts are compatible with the new planetary core.

## Routes

| Route | Purpose |
|---|---|
| / | Landing page and cinematic Earth hero |
| /dashboard | Interactive planetary observatory |
| /map | OpenStreetMap world view and private device location |
| /about | Project purpose and limitations |
| /privacy | Privacy policy |
| /terms | Terms of use |
| /data-policy | External source and licensing notes |

## Data provenance and limitations

3D Earth is a visualization layer. Public feeds can be delayed, rate-limited, incomplete or unavailable.

Important boundaries:

- **OpenStreetMap:** map data is © OpenStreetMap contributors. The standard tile service is best-effort and subject to its usage policy; production scale may require a dedicated OSM-derived tile provider or self-hosting.
- **Nominatim:** reverse geocoding is throttled and cached server-side. It is not an autocomplete or bulk-geocoding service.
- **CelesTrak:** current GP orbital elements and SATCAT catalogue metadata are used for orbital tracking.
- **satellite.js:** performs SGP4/SDP4 propagation and coordinate transforms in the browser.
- **Open-Meteo:** supplies the geographic timezone response used for observer time context and may supply weather data elsewhere in the application.
- **Browser Geolocation:** device-provided and permission-controlled; it is not survey-grade by default.
- **NASA:** useful for mission and scientific context, but not treated as the universal live orbital-catalogue authority.

No visual layer should be interpreted as certified navigation, surveying, emergency response, aviation control, meteorological warning, military intelligence, or another safety-critical service.

## Development

~~~powershell
npm install
npm test
npm run check:syntax
npm start
~~~

The CI workflow runs both the application tests and JavaScript syntax checks on pushes and pull requests.

## Engineering principles

1. **Real data over decorative animation.**
2. **Deterministic calculations over hardcoded visual states.**
3. **Source and timestamp visibility for live data.**
4. **Private-by-default handling of exact observer location.**
5. **Honest uncertainty: never claim precision the device or source does not provide.**
6. **The Earth renderer must remain functional when optional feeds fail.**
7. **Mobile is a primary interface, not a shrunken desktop layout.**

## Credits

Built by **Kweezi Perez** — https://kweeziperez.com

Core open-source technologies include:
- Three.js
- Leaflet
- satellite.js
- Node.js / Express
- OpenStreetMap contributors
- CelesTrak
- Open-Meteo

External datasets and services remain subject to their own licences and usage policies.

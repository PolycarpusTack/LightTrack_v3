# Vendor Libraries

This directory contains locally bundled third-party libraries to avoid external CDN dependencies for security.

## Libraries Included:

1. **moment.js** (v2.29.4) - Date/time manipulation
2. **Chart.js** (v3.9.1) - Charting library
3. **chartjs-adapter-moment** (v1.0.1) - Chart.js moment adapter

## Security Note:

These libraries should be downloaded from official sources and verified before use:
- https://momentjs.com/
- https://www.chartjs.org/
- https://github.com/chartjs/chartjs-adapter-moment

## Installation:

```bash
# Download libraries
curl -o vendor/moment.min.js https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js
curl -o vendor/chart.min.js https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js
curl -o vendor/chartjs-adapter-moment.min.js https://cdnjs.cloudflare.com/ajax/libs/chartjs-adapter-moment/1.0.1/chartjs-adapter-moment.min.js
```

Always verify checksums after downloading.
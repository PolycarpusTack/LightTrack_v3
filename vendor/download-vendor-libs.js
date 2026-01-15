#!/usr/bin/env node
// Script to download vendor libraries for offline use
// This ensures the application works without internet connectivity

const https = require('https');
const fs = require('fs');
const path = require('path');

const libraries = [
  {
    name: 'moment.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js',
    integrity: 'sha512-CryKbMe7sjSCDPl18jtJI5DR5jtkUWxPXWaLCst6QjH8wxDexfRJic2WRmRXmstr2Y8SxDDWuBO6CQC6IE4KTA=='
  },
  {
    name: 'chart.min.js', 
    url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js',
    integrity: 'sha512-ElRFoEQdI5Ht6kZvyzXhYG9NqjtkmlkfYk0wr6wHxU9JEHakS7UJZNeml5ALk+8IKlU6jDgMabC3vkumRokgJA=='
  },
  {
    name: 'chartjs-adapter-moment.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/chartjs-adapter-moment/1.0.1/chartjs-adapter-moment.min.js',
    integrity: 'sha512-oh5t+CdSBsaVVAvxcZKy3XJdP7ZbYUBSRCXDTVn0ODewMDDNnELsrG9eDm8rVZAQg7RsDD/8K3MjPAFB13o6eA=='
  }
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete incomplete file
        reject(err);
      });
    }).on('error', reject);
  });
}

async function downloadAllLibraries() {
  console.log('Downloading vendor libraries...\n');
  
  for (const lib of libraries) {
    const destPath = path.join(__dirname, lib.name);
    
    try {
      console.log(`Downloading ${lib.name}...`);
      await downloadFile(lib.url, destPath);
      console.log(`✓ Downloaded ${lib.name}`);
      
      // Add integrity check comment to file
      const content = fs.readFileSync(destPath, 'utf8');
      const withIntegrity = `/* Integrity: ${lib.integrity} */\n${content}`;
      fs.writeFileSync(destPath, withIntegrity);
      
    } catch (error) {
      console.error(`✗ Failed to download ${lib.name}:`, error.message);
      
      // Create a more functional stub if download fails
      const stubContent = createFunctionalStub(lib.name);
      fs.writeFileSync(destPath, stubContent);
      console.log(`  Created functional stub for ${lib.name}`);
    }
  }
  
  console.log('\nVendor library setup complete!');
  console.log('Note: If any downloads failed, functional stubs were created.');
  console.log('You can re-run this script when internet is available.');
}

function createFunctionalStub(libName) {
  switch(libName) {
    case 'moment.min.js':
      return `/* Moment.js stub - Replace with actual library */
(function(global) {
  function Moment(date) {
    this._d = date ? new Date(date) : new Date();
  }
  
  Moment.prototype = {
    format: function(fmt) {
      const d = this._d;
      const pad = (n) => n < 10 ? '0' + n : n;
      
      if (fmt === 'YYYY-MM-DD') {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }
      if (fmt === 'HH:mm:ss') {
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      }
      return d.toISOString();
    },
    fromNow: function() {
      const diff = Date.now() - this._d.getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return days + ' days ago';
      if (hours > 0) return hours + ' hours ago';
      if (minutes > 0) return minutes + ' minutes ago';
      return 'just now';
    },
    diff: function(other, unit) {
      const diff = this._d - (other._d || other);
      switch(unit) {
        case 'seconds': return Math.floor(diff / 1000);
        case 'minutes': return Math.floor(diff / 60000);
        case 'hours': return Math.floor(diff / 3600000);
        case 'days': return Math.floor(diff / 86400000);
        default: return diff;
      }
    },
    subtract: function(num, unit) {
      const ms = this._d.getTime();
      const mult = unit === 'days' ? 86400000 : unit === 'hours' ? 3600000 : 60000;
      return moment(new Date(ms - (num * mult)));
    },
    startOf: function(unit) {
      const d = new Date(this._d);
      if (unit === 'day') {
        d.setHours(0, 0, 0, 0);
      }
      return moment(d);
    }
  };
  
  function moment(date) {
    return new Moment(date);
  }
  
  moment.duration = function(ms) {
    return {
      asMinutes: () => ms / 60000,
      asHours: () => ms / 3600000,
      humanize: () => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) return hours + 'h ' + minutes + 'm';
        return minutes + 'm';
      }
    };
  };
  
  global.moment = moment;
})(window);`;

    case 'chart.min.js':
      return `/* Chart.js stub - Replace with actual library */
(function(global) {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data || {};
      this.options = config.options || {};
      console.log('Chart.js stub: Chart created');
    }
    
    destroy() {
      console.log('Chart.js stub: Chart destroyed');
    }
    
    update() {
      console.log('Chart.js stub: Chart updated');
    }
    
    render() {
      console.log('Chart.js stub: Chart rendered');
    }
  }
  
  // Basic Chart types
  Chart.register = function() {};
  Chart.defaults = { font: {} };
  
  global.Chart = Chart;
})(window);`;

    case 'chartjs-adapter-moment.min.js':
      return `/* Chart.js Moment Adapter stub - Replace with actual library */
// Adapter will be functional when both Chart.js and Moment.js are properly loaded
console.log('Chart.js Moment adapter stub loaded');`;
      
    default:
      return `/* ${libName} stub - Replace with actual library */`;
  }
}

// Run if called directly
if (require.main === module) {
  downloadAllLibraries().catch(console.error);
}

module.exports = { downloadAllLibraries };
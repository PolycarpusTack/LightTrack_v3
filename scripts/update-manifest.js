#!/usr/bin/env node

/**
 * @file scripts/update-manifest.js
 * @description Update release manifest for auto-updater
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');

class ManifestUpdater {
  constructor(options = {}) {
    this.options = {
      channel: 'stable',
      version: null,
      manifestPath: path.join(__dirname, '..', 'update-manifest.json'),
      distPath: path.join(__dirname, '..', 'dist'),
      baseUrl: 'https://releases.lighttrack.app',
      ...options
    };
  }
  
  /**
   * Update the release manifest
   */
  async update() {
    console.log('📄 Updating release manifest...');
    console.log(`Channel: ${this.options.channel}`);
    console.log(`Version: ${this.options.version}`);
    
    try {
      // Load existing manifest
      const manifest = this.loadManifest();
      
      // Get release files
      const releaseFiles = await this.getReleaseFiles();
      
      // Create release entry
      const release = await this.createReleaseEntry(releaseFiles);
      
      // Update manifest
      this.updateManifest(manifest, release);
      
      // Save manifest
      this.saveManifest(manifest);
      
      console.log('✅ Manifest updated successfully!');
      
    } catch (error) {
      console.error('❌ Failed to update manifest:', error.message);
      process.exit(1);
    }
  }
  
  /**
   * Load existing manifest
   */
  loadManifest() {
    if (fs.existsSync(this.options.manifestPath)) {
      return JSON.parse(fs.readFileSync(this.options.manifestPath, 'utf8'));
    }
    
    // Create new manifest structure
    return {
      name: 'LightTrack',
      description: 'Lightweight time tracking application',
      homepage: 'https://lighttrack.app',
      channels: {
        stable: {
          current: null,
          releases: []
        },
        beta: {
          current: null,
          releases: []
        },
        alpha: {
          current: null,
          releases: []
        }
      },
      updatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get release files from dist directory
   */
  async getReleaseFiles() {
    if (!fs.existsSync(this.options.distPath)) {
      throw new Error('Distribution directory not found');
    }
    
    const files = fs.readdirSync(this.options.distPath);
    const releaseFiles = [];
    
    for (const file of files) {
      const filePath = path.join(this.options.distPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile() && this.isReleaseFile(file)) {
        const fileInfo = await this.getFileInfo(filePath, file);
        releaseFiles.push(fileInfo);
      }
    }
    
    return releaseFiles;
  }
  
  /**
   * Check if file is a release file
   */
  isReleaseFile(filename) {
    const releaseExtensions = [
      '.exe', '.msi', // Windows
      '.dmg', '.zip', // macOS
      '.AppImage', '.deb', '.rpm', '.tar.gz' // Linux
    ];
    
    return releaseExtensions.some(ext => filename.endsWith(ext));
  }
  
  /**
   * Get file information
   */
  async getFileInfo(filePath, filename) {
    const stats = fs.statSync(filePath);
    const hash = await this.calculateFileHash(filePath);
    
    return {
      name: filename,
      url: `${this.options.baseUrl}/${this.options.channel}/${this.options.version}/${filename}`,
      size: stats.size,
      sha256: hash,
      platform: this.detectPlatform(filename),
      architecture: this.detectArchitecture(filename)
    };
  }
  
  /**
   * Calculate file hash
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  /**
   * Detect platform from filename
   */
  detectPlatform(filename) {
    if (filename.includes('win') || filename.endsWith('.exe') || filename.endsWith('.msi')) {
      return 'windows';
    }
    if (filename.includes('mac') || filename.endsWith('.dmg')) {
      return 'darwin';
    }
    if (filename.includes('linux') || filename.endsWith('.AppImage') || 
        filename.endsWith('.deb') || filename.endsWith('.rpm')) {
      return 'linux';
    }
    return 'unknown';
  }
  
  /**
   * Detect architecture from filename
   */
  detectArchitecture(filename) {
    if (filename.includes('x64') || filename.includes('amd64')) {
      return 'x64';
    }
    if (filename.includes('arm64') || filename.includes('aarch64')) {
      return 'arm64';
    }
    if (filename.includes('x86') || filename.includes('i386')) {
      return 'ia32';
    }
    return 'x64'; // Default to x64
  }
  
  /**
   * Create release entry
   */
  async createReleaseEntry(files) {
    const changelog = await this.getChangelog();
    
    return {
      version: this.options.version,
      releaseDate: new Date().toISOString(),
      channel: this.options.channel,
      changelog: changelog,
      files: files,
      minimumVersion: this.getMinimumVersion(),
      critical: this.isCriticalUpdate(),
      rollout: this.getRolloutConfig()
    };
  }
  
  /**
   * Get changelog for this version
   */
  async getChangelog() {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    
    if (!fs.existsSync(changelogPath)) {
      return {
        summary: 'Bug fixes and improvements',
        features: [],
        fixes: [],
        breaking: []
      };
    }
    
    // Parse changelog for this version
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    return this.parseChangelog(changelog, this.options.version);
  }
  
  /**
   * Parse changelog for specific version
   */
  parseChangelog(changelog, version) {
    const versionRegex = new RegExp(`## \\[${version}\\].*?(?=## \\[|$)`, 's');
    const match = changelog.match(versionRegex);
    
    if (!match) {
      return {
        summary: 'Bug fixes and improvements',
        features: [],
        fixes: [],
        breaking: []
      };
    }
    
    const versionText = match[0];
    
    return {
      summary: this.extractSummary(versionText),
      features: this.extractFeatures(versionText),
      fixes: this.extractFixes(versionText),
      breaking: this.extractBreaking(versionText)
    };
  }
  
  /**
   * Extract summary from changelog
   */
  extractSummary(text) {
    const summaryMatch = text.match(/### Summary\n\n(.+?)\n/s);
    return summaryMatch ? summaryMatch[1].trim() : 'Bug fixes and improvements';
  }
  
  /**
   * Extract features from changelog
   */
  extractFeatures(text) {
    const featuresMatch = text.match(/### Added\n(.*?)(?=### |$)/s);
    if (!featuresMatch) return [];
    
    return this.parseListItems(featuresMatch[1]);
  }
  
  /**
   * Extract fixes from changelog
   */
  extractFixes(text) {
    const fixesMatch = text.match(/### Fixed\n(.*?)(?=### |$)/s);
    if (!fixesMatch) return [];
    
    return this.parseListItems(fixesMatch[1]);
  }
  
  /**
   * Extract breaking changes from changelog
   */
  extractBreaking(text) {
    const breakingMatch = text.match(/### Breaking\n(.*?)(?=### |$)/s);
    if (!breakingMatch) return [];
    
    return this.parseListItems(breakingMatch[1]);
  }
  
  /**
   * Parse list items from text
   */
  parseListItems(text) {
    return text
      .split('\n')
      .filter(line => line.trim().startsWith('- '))
      .map(line => line.trim().substring(2))
      .filter(item => item.length > 0);
  }
  
  /**
   * Get minimum version for this update
   */
  getMinimumVersion() {
    // This could be configurable or read from package.json
    return '1.0.0';
  }
  
  /**
   * Check if this is a critical update
   */
  isCriticalUpdate() {
    // This could be determined by changelog keywords or manual flag
    return process.env.CRITICAL_UPDATE === 'true';
  }
  
  /**
   * Get rollout configuration
   */
  getRolloutConfig() {
    return {
      percentage: this.options.channel === 'stable' ? 10 : 100, // Gradual rollout for stable
      startDate: new Date().toISOString(),
      regions: ['*'] // All regions
    };
  }
  
  /**
   * Update manifest with new release
   */
  updateManifest(manifest, release) {
    const channel = manifest.channels[this.options.channel];
    
    // Add to releases array
    channel.releases.unshift(release);
    
    // Keep only last 10 releases
    channel.releases = channel.releases.slice(0, 10);
    
    // Update current version
    channel.current = release.version;
    
    // Update manifest timestamp
    manifest.updatedAt = new Date().toISOString();
  }
  
  /**
   * Save manifest to file
   */
  saveManifest(manifest) {
    fs.writeFileSync(
      this.options.manifestPath,
      JSON.stringify(manifest, null, 2)
    );
  }
}

// CLI interface
if (require.main === module) {
  program
    .option('-c, --channel <channel>', 'Release channel', 'stable')
    .option('-v, --version <version>', 'Version number')
    .option('-m, --manifest <path>', 'Manifest file path')
    .option('-d, --dist <path>', 'Distribution directory')
    .option('-u, --base-url <url>', 'Base URL for downloads')
    .parse();
  
  const options = program.opts();
  
  if (!options.version) {
    console.error('Version is required');
    process.exit(1);
  }
  
  const updater = new ManifestUpdater(options);
  updater.update();
}

module.exports = ManifestUpdater;
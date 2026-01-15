#!/usr/bin/env node

/**
 * @file scripts/build.js
 * @description Build script for LightTrack application
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pkg = require('../package.json');

class Builder {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.distDir = path.join(this.rootDir, 'dist');
    this.srcDir = path.join(this.rootDir, 'src');
    this.buildConfig = {
      minify: process.env.NODE_ENV === 'production',
      sourceMaps: process.env.NODE_ENV !== 'production',
      target: process.env.BUILD_TARGET || 'all'
    };
  }
  
  /**
   * Main build process
   */
  async build() {
    console.log('\n🚀 Starting LightTrack build process...');
    console.log(`Version: ${pkg.version}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Target: ${this.buildConfig.target}\n`);
    
    try {
      // Clean previous build
      await this.clean();
      
      // Create build directories
      await this.createDirectories();
      
      // Copy static files
      await this.copyStaticFiles();
      
      // Process CSS
      await this.processCSS();
      
      // Process JavaScript
      await this.processJavaScript();
      
      // Copy Electron main process files
      await this.copyElectronFiles();
      
      // Generate package.json for distribution
      await this.generateDistPackageJson();
      
      // Copy node_modules (production only)
      await this.copyNodeModules();
      
      // Generate build info
      await this.generateBuildInfo();
      
      console.log('\n✅ Build completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Build failed:', error.message);
      process.exit(1);
    }
  }
  
  /**
   * Clean previous build
   */
  async clean() {
    console.log('🧽 Cleaning previous build...');
    
    if (fs.existsSync(this.distDir)) {
      fs.rmSync(this.distDir, { recursive: true, force: true });
    }
  }
  
  /**
   * Create build directories
   */
  async createDirectories() {
    console.log('📁 Creating build directories...');
    
    const dirs = [
      this.distDir,
      path.join(this.distDir, 'src'),
      path.join(this.distDir, 'src', 'main'),
      path.join(this.distDir, 'src', 'renderer'),
      path.join(this.distDir, 'src', 'renderer', 'js'),
      path.join(this.distDir, 'src', 'renderer', 'styles'),
      path.join(this.distDir, 'src', 'renderer', 'components'),
      path.join(this.distDir, 'src', 'renderer', 'features'),
      path.join(this.distDir, 'src', 'shared'),
      path.join(this.distDir, 'assets'),
      path.join(this.distDir, 'resources')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Copy static files
   */
  async copyStaticFiles() {
    console.log('📄 Copying static files...');
    
    // Copy HTML files
    this.copyFile(
      path.join(this.srcDir, 'renderer', 'index.html'),
      path.join(this.distDir, 'index.html')
    );
    
    // Copy assets
    if (fs.existsSync(path.join(this.rootDir, 'assets'))) {
      this.copyDirectory(
        path.join(this.rootDir, 'assets'),
        path.join(this.distDir, 'assets')
      );
    }
    
    // Copy resources
    if (fs.existsSync(path.join(this.rootDir, 'resources'))) {
      this.copyDirectory(
        path.join(this.rootDir, 'resources'),
        path.join(this.distDir, 'resources')
      );
    }
  }
  
  /**
   * Process CSS files
   */
  async processCSS() {
    console.log('🎨 Processing CSS...');
    
    const cssDir = path.join(this.srcDir, 'renderer', 'styles');
    const outputDir = path.join(this.distDir, 'src', 'renderer', 'styles');
    
    if (!fs.existsSync(cssDir)) return;
    
    const cssFiles = fs.readdirSync(cssDir)
      .filter(file => file.endsWith('.css'));
    
    for (const file of cssFiles) {
      const inputPath = path.join(cssDir, file);
      const outputPath = path.join(outputDir, file);
      
      let css = fs.readFileSync(inputPath, 'utf8');
      
      if (this.buildConfig.minify) {
        css = this.minifyCSS(css);
      }
      
      fs.writeFileSync(outputPath, css);
    }
  }
  
  /**
   * Process JavaScript files
   */
  async processJavaScript() {
    console.log('📜 Processing JavaScript...');
    
    // Copy and process renderer JavaScript
    this.processJSDirectory(
      path.join(this.srcDir, 'renderer'),
      path.join(this.distDir, 'src', 'renderer')
    );
    
    // Copy shared modules
    this.processJSDirectory(
      path.join(this.srcDir, 'shared'),
      path.join(this.distDir, 'src', 'shared')
    );
  }
  
  /**
   * Process JS directory recursively
   */
  processJSDirectory(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) return;
    
    const items = fs.readdirSync(sourceDir);
    
    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
        this.processJSDirectory(sourcePath, targetPath);
      } else if (item.endsWith('.js')) {
        let js = fs.readFileSync(sourcePath, 'utf8');
        
        if (this.buildConfig.minify) {
          js = this.minifyJS(js);
        }
        
        fs.writeFileSync(targetPath, js);
      } else {
        // Copy other files as-is
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
  
  /**
   * Copy Electron main process files
   */
  async copyElectronFiles() {
    console.log('⚡ Copying Electron files...');
    
    const mainDir = path.join(this.srcDir, 'main');
    const outputDir = path.join(this.distDir, 'src', 'main');
    
    if (fs.existsSync(mainDir)) {
      this.copyDirectory(mainDir, outputDir);
    }
    
    // Copy main entry point
    if (fs.existsSync(path.join(this.rootDir, 'main.js'))) {
      this.copyFile(
        path.join(this.rootDir, 'main.js'),
        path.join(this.distDir, 'main.js')
      );
    }
  }
  
  /**
   * Generate package.json for distribution
   */
  async generateDistPackageJson() {
    console.log('📦 Generating distribution package.json...');
    
    const distPkg = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      main: pkg.main,
      author: pkg.author,
      license: pkg.license,
      homepage: pkg.homepage,
      dependencies: pkg.dependencies || {},
      engines: pkg.engines
    };
    
    fs.writeFileSync(
      path.join(this.distDir, 'package.json'),
      JSON.stringify(distPkg, null, 2)
    );

    // Copy package-lock.json for npm ci
    const lockFile = path.join(this.rootDir, 'package-lock.json');
    if (fs.existsSync(lockFile)) {
      fs.copyFileSync(lockFile, path.join(this.distDir, 'package-lock.json'));
    }
  }
  
  /**
   * Copy production node_modules
   */
  async copyNodeModules() {
    console.log('📚 Copying production dependencies...');
    
    try {
      // Install production dependencies in dist
      execSync('npm ci --only=production', {
        cwd: this.distDir,
        stdio: 'inherit'
      });
    } catch (error) {
      console.warn('⚠️  Failed to install production dependencies:', error.message);
    }
  }
  
  /**
   * Generate build info
   */
  async generateBuildInfo() {
    console.log('📊 Generating build info...');
    
    const buildInfo = {
      version: pkg.version,
      buildDate: new Date().toISOString(),
      gitCommit: this.getGitCommit(),
      gitBranch: this.getGitBranch(),
      environment: process.env.NODE_ENV || 'development',
      target: this.buildConfig.target,
      buildNumber: process.env.BUILD_NUMBER || null
    };
    
    fs.writeFileSync(
      path.join(this.distDir, 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
  }
  
  /**
   * Get git commit hash
   */
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Get git branch
   */
  getGitBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Simple CSS minification
   */
  minifyCSS(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/;\s*}/g, '}') // Remove last semicolon
      .replace(/\s*{\s*/g, '{') // Clean braces
      .replace(/}\s*/g, '}') // Clean closing braces
      .replace(/;\s*/g, ';') // Clean semicolons
      .trim();
  }
  
  /**
   * Simple JS minification (basic)
   */
  minifyJS(js) {
    return js
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/^\s*\n/gm, '') // Remove empty lines
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }
  
  /**
   * Copy file helper
   */
  copyFile(source, target) {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(source, target);
  }
  
  /**
   * Copy directory helper
   */
  copyDirectory(source, target) {
    if (!fs.existsSync(source)) return;
    
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    
    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

// Run build if called directly
if (require.main === module) {
  const builder = new Builder();
  builder.build();
}

module.exports = Builder;
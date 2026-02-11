# SplatViewer

A lightweight JavaScript library for viewing 3D Gaussian Splats with parallax effects.

## Features

- 📦 Zero-config CDN import with built-in demo
- 🖼️ Placeholder image with smooth transition
- 📱 Device motion parallax (gyroscope)
- 🖱️ Mouse parallax for desktop
- 🎮 Pan, rotate, zoom controls
- 📊 Built-in loading bar
- ⚡ Built on [@mkkellogg/gaussian-splats-3d](https://github.com/mkkellogg/GaussianSplats3D)

## Installation

### CDN (jsDelivr)

```html
<script type="module">
  import { SplatViewer } from 'https://cdn.jsdelivr.net/gh/BenGrande/parallax-photo@main/splat-viewer.js';
</script>
```

### Local

```html
<script type="module">
  import { SplatViewer } from './splat-viewer.js';
</script>
```

## Quick Start

### Zero-Config Demo

```javascript
import { SplatViewer } from 'https://cdn.jsdelivr.net/gh/BenGrande/parallax-photo@main/splat-viewer.js';

// No options = loads built-in demo scene
const viewer = new SplatViewer('#container');
await viewer.load();
```

### Custom Scene

```javascript
import { SplatViewer } from './splat-viewer.js';

const viewer = new SplatViewer('#container', {
  plyUrl: 'scene.ply',
  placeholderImage: 'photo.jpg'
});

await viewer.load();
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `plyUrl` | string | null | URL to the .ply splat file |
| `placeholderImage` | string | null | Image to show while loading |
| `transitionDuration` | number | 1200 | Fade transition duration (ms) |
| `cameraPosition` | array | [0,0,0] | Initial camera position [x,y,z] |
| `cameraLookAt` | array | [0,0,50] | Camera look-at target [x,y,z] |
| `cameraUp` | array | [0,-1,0] | Camera up vector |
| `fov` | number | 48.5 | Field of view (degrees) |
| `enableControls` | boolean | true | Enable orbit controls |
| `perspectiveIntensity` | number | 0.5 | Parallax effect strength |
| `showLoadingBar` | boolean | true | Show built-in loading progress bar |
| `loadingBarColor` | string | '#4a90d9' | Loading bar color |
| `loadingBarHeight` | string | '3px' | Loading bar height |
| `onProgress` | function | null | Loading progress callback (percent) |
| `onLoad` | function | null | Called when splat is loaded |
| `onFallback` | function | null | Called when switching to 2D fallback |
| `onError` | function | null | Called on error |

## Methods

### Loading

```javascript
// Load splat (uses plyUrl from options, or defaults to demo)
await viewer.load();

// Load specific URL
await viewer.load('other-scene.ply');
```

### Perspective (Parallax)

```javascript
// Subtle view shift - like moving your head
viewer.perspective(offsetX, offsetY, offsetZ);

// Adjust parallax intensity
viewer.setPerspectiveIntensity(0.8);
```

### Device Motion

```javascript
// Enable gyroscope-based parallax
viewer.enableDeviceMotion();

// Disable
viewer.disableDeviceMotion();

// Recalibrate (set current orientation as neutral)
viewer.calibrateDeviceMotion();
```

### Camera Controls

```javascript
// Pan (translate)
viewer.pan(deltaX, deltaY);

// Rotate (orbit)
viewer.rotate(deltaYaw, deltaPitch);

// Zoom
viewer.zoom(delta);

// Reset to initial position
viewer.reset();

// Direct position control
viewer.setCameraPosition(x, y, z);
viewer.getCameraPosition(); // returns [x, y, z]

// Adjust control speeds
viewer.setSpeed(orbit, pan, zoom);
```

### Fallback Mode

```javascript
// Force 2D fallback mode (for low-memory devices)
viewer.forceFallback();

// Check mode
viewer.isFallbackMode; // boolean
```

### Cleanup

```javascript
viewer.dispose();
```

## Device Motion Example

```javascript
const viewer = new SplatViewer('#container', {
  plyUrl: 'scene.ply',
  placeholderImage: 'photo.jpg',
  perspectiveIntensity: 0.8
});

await viewer.load();

// Request permission and enable (required for iOS)
document.querySelector('#enableMotion').onclick = async () => {
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') return;
  }
  viewer.enableDeviceMotion();
};
```

## Mouse Parallax Example

```javascript
document.addEventListener('mousemove', (e) => {
  if (!viewer.isLoaded) return;
  
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const offsetX = (e.clientX - cx) / cx;
  const offsetY = (e.clientY - cy) / cy;
  
  viewer.perspective(offsetX * 0.15, offsetY * 0.15);
});
```

## Generating PLY Files

Use [Apple's SHARP](https://github.com/apple/ml-sharp) to generate 3D Gaussian Splats from a single photo:

```bash
sharp predict --input-path photo.jpg --output-path output/ --device mps
```

## Default Demo Scene

The built-in demo uses a foggy mountain photo:
- **Photo by [v2osk](https://unsplash.com/@v2osk) on [Unsplash](https://unsplash.com/photos/foggy-mountain-summit-1Z2niiBPg5A)**

## License

MIT

/**
 * SplatViewer - Lightweight 3D Gaussian Splat Viewer
 * 
 * Usage:
 *   // With direct URLs
 *   const viewer = new SplatViewer('#container', {
 *     plyUrl: 'scene.ply',
 *     placeholderImage: 'photo.jpg'
 *   });
 * 
 *   // With SHARP API scene ID
 *   const viewer = new SplatViewer('#container', {
 *     sceneId: '2729990f-aa9e-42b9-9ce8-facc5ee616e8',
 *     apiBaseUrl: 'http://localhost:8000'
 *   });
 */

import * as GaussianSplats3D from 'https://esm.sh/@mkkellogg/gaussian-splats-3d@0.4.7';

export class SplatViewer {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        this.options = {
            // Scene source (either direct URLs or API)
            plyUrl: null,
            placeholderImage: null,
            sceneId: null,                    // SHARP API scene ID
            apiBaseUrl: 'http://localhost:8000',
            
            // Display options
            transitionDuration: 1200,
            cameraPosition: [0, 0, 0],
            cameraLookAt: [0, 0, 50],
            cameraUp: [0, -1, 0],
            fov: 48.5,
            enableControls: true,
            perspectiveIntensity: 0.5,
            
            // Memory management
            memoryThresholdMB: 512,           // Fall back to image if memory exceeds this
            memoryCheckInterval: 2000,        // Check memory every N ms
            
            // Callbacks
            onLoad: null,
            onError: null,
            onProgress: null,
            onFallback: null,                 // Called when falling back to image mode
            ...options
        };

        this.viewer = null;
        this.isLoaded = false;
        this.isFallbackMode = false;
        this._orbitSpeed = 0.01;
        this._panSpeed = 0.1;
        this._zoomSpeed = 1;
        
        // Device motion state
        this._deviceMotionEnabled = false;
        this._deviceMotionHandler = null;
        this._baseOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this._hasBaseOrientation = false;
        
        // Camera state
        this._initialCameraPosition = [...this.options.cameraPosition];
        this._initialCameraLookAt = [...this.options.cameraLookAt];
        this._currentPerspective = { x: 0, y: 0 };
        
        // Elements
        this._placeholder = null;
        this._fallbackImage = null;
        this._memoryCheckTimer = null;
        
        // Resolved URLs (from API or direct)
        this._imageUrl = null;
        this._plyUrl = null;
    }

    async _fetchSceneFromAPI() {
        if (!this.options.sceneId) return;
        
        const response = await fetch(`${this.options.apiBaseUrl}/scenes/${this.options.sceneId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch scene: ${response.statusText}`);
        }
        
        const scene = await response.json();
        
        if (scene.status !== 'completed') {
            throw new Error(`Scene not ready: ${scene.status}`);
        }
        
        this._imageUrl = scene.image_url;
        this._plyUrl = scene.ply_url;
    }

    _setupPlaceholder() {
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';
        
        this._placeholder = document.createElement('div');
        this._placeholder.className = 'splat-placeholder';
        this._placeholder.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('${this._imageUrl}');
            background-size: cover;
            background-position: center;
            z-index: 10;
            transition: opacity ${this.options.transitionDuration}ms ease-out,
                        transform ${this.options.transitionDuration}ms ease-out,
                        filter ${this.options.transitionDuration}ms ease-out;
        `;
        
        this.container.appendChild(this._placeholder);
    }

    _setupFallbackImage() {
        this._fallbackImage = document.createElement('div');
        this._fallbackImage.className = 'splat-fallback';
        this._fallbackImage.style.cssText = `
            position: absolute;
            top: -5%;
            left: -5%;
            width: 110%;
            height: 110%;
            background-image: url('${this._imageUrl}');
            background-size: cover;
            background-position: center;
            z-index: 5;
            opacity: 0;
            transition: opacity 0.5s ease, transform 0.1s ease-out;
            will-change: transform;
        `;
        
        this.container.appendChild(this._fallbackImage);
    }

    _revealSplat() {
        if (!this._placeholder) return;
        
        this._placeholder.style.opacity = '0';
        this._placeholder.style.transform = 'scale(1.05)';
        this._placeholder.style.filter = 'blur(10px)';
        
        setTimeout(() => {
            if (this._placeholder?.parentNode) {
                this._placeholder.parentNode.removeChild(this._placeholder);
                this._placeholder = null;
            }
        }, this.options.transitionDuration);
    }

    _getMemoryUsageMB() {
        if (performance.memory) {
            return performance.memory.usedJSHeapSize / (1024 * 1024);
        }
        // Fallback estimation based on device
        return null;
    }

    _startMemoryMonitoring() {
        if (!performance.memory) return; // Only works in Chrome
        
        this._memoryCheckTimer = setInterval(() => {
            const memoryMB = this._getMemoryUsageMB();
            if (memoryMB && memoryMB > this.options.memoryThresholdMB) {
                console.warn(`Memory usage high (${memoryMB.toFixed(0)}MB), switching to fallback mode`);
                this._activateFallbackMode();
            }
        }, this.options.memoryCheckInterval);
    }

    _stopMemoryMonitoring() {
        if (this._memoryCheckTimer) {
            clearInterval(this._memoryCheckTimer);
            this._memoryCheckTimer = null;
        }
    }

    _activateFallbackMode() {
        if (this.isFallbackMode) return;
        
        this.isFallbackMode = true;
        this._stopMemoryMonitoring();
        
        // Dispose 3D viewer to free memory
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        
        // Show fallback image
        if (this._fallbackImage) {
            this._fallbackImage.style.opacity = '1';
        }
        
        // Apply current perspective to fallback
        this._applyFallbackPerspective();
        
        if (this.options.onFallback) {
            this.options.onFallback();
        }
    }

    _applyFallbackPerspective() {
        if (!this._fallbackImage) return;
        
        const { x, y } = this._currentPerspective;
        const intensity = this.options.perspectiveIntensity * 10;
        
        // CSS transform for parallax effect on the image
        const translateX = x * intensity * 2;
        const translateY = y * intensity * 2;
        const rotateY = x * intensity * 0.5;
        const rotateX = -y * intensity * 0.5;
        const scale = 1 + Math.abs(x * 0.02) + Math.abs(y * 0.02);
        
        this._fallbackImage.style.transform = `
            perspective(1000px)
            translateX(${translateX}px)
            translateY(${translateY}px)
            rotateY(${rotateY}deg)
            rotateX(${rotateX}deg)
            scale(${scale})
        `;
    }

    async load(plyUrl = null) {
        try {
            // Resolve URLs from API if sceneId provided
            if (this.options.sceneId) {
                await this._fetchSceneFromAPI();
            } else {
                this._imageUrl = this.options.placeholderImage;
                this._plyUrl = plyUrl || this.options.plyUrl;
            }
            
            if (!this._plyUrl) throw new Error('No PLY URL provided');
            
            // Setup placeholder and fallback images
            if (this._imageUrl) {
                this._setupPlaceholder();
                this._setupFallbackImage();
            }
            
            // Create 3D viewer
            this.viewer = new GaussianSplats3D.Viewer({
                rootElement: this.container,
                cameraUp: this.options.cameraUp,
                initialCameraPosition: this.options.cameraPosition,
                initialCameraLookAt: this.options.cameraLookAt,
                selfDrivenMode: true,
                useBuiltInControls: this.options.enableControls,
                sharedMemoryForWorkers: false,
                dynamicScene: false,
                antialiased: false,
                sphericalHarmonicsDegree: 0,
                freeIntermediateSplatData: true,
                halfPrecisionCovariancesOnGPU: true
            });

            await this.viewer.addSplatScene(this._plyUrl, {
                splatAlphaRemovalThreshold: 1,
                showLoadingUI: false,
                progressiveLoad: false,
                onProgress: (pct) => {
                    if (this.options.onProgress) this.options.onProgress(pct);
                }
            });

            if (this.viewer.camera) {
                this.viewer.camera.fov = this.options.fov;
                this.viewer.camera.updateProjectionMatrix();
            }

            this.viewer.start();
            this.isLoaded = true;
            
            if (this.camera) {
                this._initialCameraPosition = [
                    this.camera.position.x,
                    this.camera.position.y,
                    this.camera.position.z
                ];
            }

            // Start memory monitoring
            this._startMemoryMonitoring();

            requestAnimationFrame(() => this._revealSplat());

            if (this.options.onLoad) this.options.onLoad();
            
            return this;
        } catch (err) {
            if (this.options.onError) this.options.onError(err);
            throw err;
        }
    }

    get camera() {
        return this.viewer?.camera;
    }

    getCameraPosition() {
        if (!this.camera) return null;
        const p = this.camera.position;
        return [p.x, p.y, p.z];
    }

    setCameraPosition(x, y, z) {
        if (!this.camera) return this;
        this.camera.position.set(x, y, z);
        return this;
    }

    perspective(offsetX, offsetY, offsetZ = 0) {
        this._currentPerspective = { x: offsetX, y: offsetY };
        
        if (this.isFallbackMode) {
            this._applyFallbackPerspective();
            return this;
        }
        
        if (!this.camera) return this;
        
        const intensity = this.options.perspectiveIntensity;
        
        this.camera.position.set(
            this._initialCameraPosition[0] + (offsetX * intensity),
            this._initialCameraPosition[1] + (offsetY * intensity),
            this._initialCameraPosition[2] + (offsetZ * intensity * 0.5)
        );
        
        this.camera.lookAt(
            this._initialCameraLookAt[0],
            this._initialCameraLookAt[1],
            this._initialCameraLookAt[2]
        );
        
        return this;
    }

    setPerspectiveIntensity(intensity) {
        this.options.perspectiveIntensity = intensity;
        return this;
    }

    enableDeviceMotion() {
        if (this._deviceMotionEnabled) return this;
        
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') this._setupDeviceMotion();
                })
                .catch(console.error);
        } else {
            this._setupDeviceMotion();
        }
        
        return this;
    }

    _setupDeviceMotion() {
        this._deviceMotionHandler = (event) => {
            if (!this.isLoaded && !this.isFallbackMode) return;
            
            const { beta, gamma } = event;
            if (beta === null || gamma === null) return;
            
            if (!this._hasBaseOrientation) {
                this._baseOrientation = { beta, gamma };
                this._hasBaseOrientation = true;
                return;
            }
            
            let deltaBeta = Math.max(-30, Math.min(30, beta - this._baseOrientation.beta));
            let deltaGamma = Math.max(-30, Math.min(30, gamma - this._baseOrientation.gamma));
            
            const offsetX = (deltaGamma / 30) * 0.3;
            const offsetY = (deltaBeta / 30) * 0.3;
            
            this.perspective(offsetX, offsetY);
        };

        window.addEventListener('deviceorientation', this._deviceMotionHandler);
        this._deviceMotionEnabled = true;
    }

    disableDeviceMotion() {
        if (this._deviceMotionHandler) {
            window.removeEventListener('deviceorientation', this._deviceMotionHandler);
            this._deviceMotionHandler = null;
        }
        this._deviceMotionEnabled = false;
        this._hasBaseOrientation = false;
        return this;
    }

    calibrateDeviceMotion() {
        this._hasBaseOrientation = false;
        return this;
    }

    pan(deltaX, deltaY) {
        if (this.isFallbackMode) return this;
        if (!this.camera) return this;
        this._initialCameraPosition[0] -= deltaX * this._panSpeed;
        this._initialCameraPosition[1] += deltaY * this._panSpeed;
        this.camera.position.set(...this._initialCameraPosition);
        return this;
    }

    rotate(deltaYaw, deltaPitch) {
        if (this.isFallbackMode) return this;
        if (!this.viewer?.controls) return this;
        const controls = this.viewer.controls;
        if (controls?.rotateLeft && controls?.rotateUp) {
            controls.rotateLeft(deltaYaw * this._orbitSpeed);
            controls.rotateUp(deltaPitch * this._orbitSpeed);
            controls.update();
        }
        return this;
    }

    zoom(delta) {
        if (this.isFallbackMode) return this;
        if (!this.camera) return this;
        this._initialCameraPosition[2] += delta * this._zoomSpeed;
        this.camera.position.set(...this._initialCameraPosition);
        return this;
    }

    reset() {
        this._currentPerspective = { x: 0, y: 0 };
        
        if (this.isFallbackMode) {
            this._applyFallbackPerspective();
            return this;
        }
        
        if (!this.camera) return this;
        this._initialCameraPosition = [...this.options.cameraPosition];
        this._initialCameraLookAt = [...this.options.cameraLookAt];
        this.camera.position.set(...this._initialCameraPosition);
        this.camera.lookAt(...this._initialCameraLookAt);
        this.calibrateDeviceMotion();
        return this;
    }

    setSpeed(orbit = 0.01, pan = 0.1, zoom = 1) {
        this._orbitSpeed = orbit;
        this._panSpeed = pan;
        this._zoomSpeed = zoom;
        return this;
    }

    // Force fallback mode (useful for testing or low-end devices)
    forceFallback() {
        this._activateFallbackMode();
        return this;
    }

    dispose() {
        this._stopMemoryMonitoring();
        this.disableDeviceMotion();
        
        if (this._placeholder?.parentNode) {
            this._placeholder.parentNode.removeChild(this._placeholder);
        }
        if (this._fallbackImage?.parentNode) {
            this._fallbackImage.parentNode.removeChild(this._fallbackImage);
        }
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        this.isLoaded = false;
        this.isFallbackMode = false;
    }
}

export default SplatViewer;
export { GaussianSplats3D };

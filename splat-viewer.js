/**
 * SplatViewer - Lightweight 3D Gaussian Splat Viewer
 * 
 * Usage:
 *   const viewer = new SplatViewer('#container', {
 *     plyUrl: 'scene.ply',
 *     placeholderImage: 'photo.jpg'  // Shows until splat loads
 *   });
 *   await viewer.load();
 */

import * as GaussianSplats3D from 'https://esm.sh/@mkkellogg/gaussian-splats-3d@0.4.7';

export class SplatViewer {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        this.options = {
            plyUrl: null,
            placeholderImage: null,      // Image to show while loading
            transitionDuration: 1200,    // ms for fade transition
            cameraPosition: [0, 0, 0],
            cameraLookAt: [0, 0, 50],
            cameraUp: [0, -1, 0],
            fov: 48.5,
            enableControls: true,
            perspectiveIntensity: 0.5,
            onLoad: null,
            onError: null,
            onProgress: null,
            ...options
        };

        this.viewer = null;
        this.isLoaded = false;
        this._orbitSpeed = 0.01;
        this._panSpeed = 0.1;
        this._zoomSpeed = 1;
        
        // Device motion state
        this._deviceMotionEnabled = false;
        this._deviceMotionHandler = null;
        this._baseOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this._hasBaseOrientation = false;
        
        // Store initial camera state
        this._initialCameraPosition = [...this.options.cameraPosition];
        this._initialCameraLookAt = [...this.options.cameraLookAt];
        
        // Placeholder elements
        this._placeholder = null;
        this._viewerCanvas = null;
        
        // Setup placeholder if provided
        if (this.options.placeholderImage) {
            this._setupPlaceholder();
        }
    }

    _setupPlaceholder() {
        // Style the container
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';
        
        // Create placeholder image
        this._placeholder = document.createElement('div');
        this._placeholder.className = 'splat-placeholder';
        this._placeholder.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('${this.options.placeholderImage}');
            background-size: cover;
            background-position: center;
            z-index: 10;
            transition: opacity ${this.options.transitionDuration}ms ease-out,
                        transform ${this.options.transitionDuration}ms ease-out,
                        filter ${this.options.transitionDuration}ms ease-out;
        `;
        
        this.container.appendChild(this._placeholder);
    }

    _revealSplat() {
        if (!this._placeholder) return;
        
        // Animate placeholder out with a nice effect
        this._placeholder.style.opacity = '0';
        this._placeholder.style.transform = 'scale(1.05)';
        this._placeholder.style.filter = 'blur(10px)';
        
        // Remove placeholder after animation
        setTimeout(() => {
            if (this._placeholder && this._placeholder.parentNode) {
                this._placeholder.parentNode.removeChild(this._placeholder);
                this._placeholder = null;
            }
        }, this.options.transitionDuration);
    }

    async load(plyUrl = null) {
        const url = plyUrl || this.options.plyUrl;
        if (!url) throw new Error('No PLY URL provided');

        try {
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

            await this.viewer.addSplatScene(url, {
                splatAlphaRemovalThreshold: 1,
                showLoadingUI: false,
                progressiveLoad: false,
                onProgress: (pct) => {
                    if (this.options.onProgress) this.options.onProgress(pct);
                }
            });

            // Set FOV
            if (this.viewer.camera) {
                this.viewer.camera.fov = this.options.fov;
                this.viewer.camera.updateProjectionMatrix();
            }

            this.viewer.start();
            this.isLoaded = true;
            
            // Store actual initial state
            if (this.camera) {
                this._initialCameraPosition = [
                    this.camera.position.x,
                    this.camera.position.y,
                    this.camera.position.z
                ];
            }

            // Reveal splat with animation
            requestAnimationFrame(() => {
                this._revealSplat();
            });

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

    /**
     * Subtle perspective shift - like moving your head slightly
     */
    perspective(offsetX, offsetY, offsetZ = 0) {
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
                    if (response === 'granted') {
                        this._setupDeviceMotion();
                    }
                })
                .catch(console.error);
        } else {
            this._setupDeviceMotion();
        }
        
        return this;
    }

    _setupDeviceMotion() {
        this._deviceMotionHandler = (event) => {
            if (!this.isLoaded) return;
            
            const { alpha, beta, gamma } = event;
            if (alpha === null || beta === null || gamma === null) return;
            
            if (!this._hasBaseOrientation) {
                this._baseOrientation = { alpha, beta, gamma };
                this._hasBaseOrientation = true;
                return;
            }
            
            let deltaBeta = beta - this._baseOrientation.beta;
            let deltaGamma = gamma - this._baseOrientation.gamma;
            
            deltaBeta = Math.max(-30, Math.min(30, deltaBeta));
            deltaGamma = Math.max(-30, Math.min(30, deltaGamma));
            
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
        if (!this.camera) return this;
        this._initialCameraPosition[0] -= deltaX * this._panSpeed;
        this._initialCameraPosition[1] += deltaY * this._panSpeed;
        this.camera.position.set(...this._initialCameraPosition);
        return this;
    }

    rotate(deltaYaw, deltaPitch) {
        if (!this.viewer?.controls) return this;
        const controls = this.viewer.controls;
        if (controls && controls.rotateLeft && controls.rotateUp) {
            controls.rotateLeft(deltaYaw * this._orbitSpeed);
            controls.rotateUp(deltaPitch * this._orbitSpeed);
            controls.update();
        }
        return this;
    }

    zoom(delta) {
        if (!this.camera) return this;
        this._initialCameraPosition[2] += delta * this._zoomSpeed;
        this.camera.position.set(...this._initialCameraPosition);
        return this;
    }

    reset() {
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

    dispose() {
        this.disableDeviceMotion();
        if (this._placeholder && this._placeholder.parentNode) {
            this._placeholder.parentNode.removeChild(this._placeholder);
        }
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        this.isLoaded = false;
    }
}

export default SplatViewer;
export { GaussianSplats3D };

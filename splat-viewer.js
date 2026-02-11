/**
 * SplatViewer - Lightweight 3D Gaussian Splat Viewer
 * 
 * Usage:
 *   const viewer = new SplatViewer('#container', { plyUrl: 'scene.ply' });
 *   await viewer.load();
 *   viewer.perspective(0.02, -0.01);  // Subtle parallax shift
 *   viewer.enableDeviceMotion();       // Auto-parallax from gyroscope
 */

import * as GaussianSplats3D from 'https://esm.sh/@mkkellogg/gaussian-splats-3d@0.4.7';

export class SplatViewer {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        this.options = {
            plyUrl: null,
            cameraPosition: [0, 0, 0],
            cameraLookAt: [0, 0, 50],
            cameraUp: [0, -1, 0],
            fov: 48.5,
            enableControls: true,
            perspectiveIntensity: 0.5,  // How much device motion affects view
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
        
        // Store initial camera state for perspective shifts
        this._initialCameraPosition = [...this.options.cameraPosition];
        this._initialCameraLookAt = [...this.options.cameraLookAt];
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
     * Creates a parallax effect without changing where you're looking
     * 
     * @param {number} offsetX - Horizontal offset (-1 to 1, subtle values like 0.02)
     * @param {number} offsetY - Vertical offset (-1 to 1, subtle values like 0.02)
     * @param {number} offsetZ - Depth offset (optional, for lean in/out)
     */
    perspective(offsetX, offsetY, offsetZ = 0) {
        if (!this.camera) return this;
        
        const intensity = this.options.perspectiveIntensity;
        
        // Apply subtle offset to camera position
        // This shifts the viewpoint while keeping the look-at target the same
        this.camera.position.set(
            this._initialCameraPosition[0] + (offsetX * intensity),
            this._initialCameraPosition[1] + (offsetY * intensity),
            this._initialCameraPosition[2] + (offsetZ * intensity * 0.5)
        );
        
        // Keep looking at the same point - this creates the parallax effect
        this.camera.lookAt(
            this._initialCameraLookAt[0],
            this._initialCameraLookAt[1],
            this._initialCameraLookAt[2]
        );
        
        return this;
    }

    /**
     * Set the intensity of perspective shifts
     * @param {number} intensity - Multiplier for perspective offsets (default 0.5)
     */
    setPerspectiveIntensity(intensity) {
        this.options.perspectiveIntensity = intensity;
        return this;
    }

    /**
     * Enable device motion (gyroscope) for automatic parallax effect
     * When user tilts their device, the view subtly shifts
     */
    enableDeviceMotion() {
        if (this._deviceMotionEnabled) return this;
        
        // Request permission on iOS 13+
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
            
            // Capture base orientation on first reading
            if (!this._hasBaseOrientation) {
                this._baseOrientation = { alpha, beta, gamma };
                this._hasBaseOrientation = true;
                return;
            }
            
            // Calculate delta from base orientation
            // beta = front-back tilt (-180 to 180), gamma = left-right tilt (-90 to 90)
            let deltaBeta = beta - this._baseOrientation.beta;
            let deltaGamma = gamma - this._baseOrientation.gamma;
            
            // Normalize and clamp
            deltaBeta = Math.max(-30, Math.min(30, deltaBeta));
            deltaGamma = Math.max(-30, Math.min(30, deltaGamma));
            
            // Convert to subtle offset (-1 to 1 range, but usually much smaller)
            const offsetX = (deltaGamma / 30) * 0.3;  // Left-right tilt
            const offsetY = (deltaBeta / 30) * 0.3;   // Front-back tilt
            
            this.perspective(offsetX, offsetY);
        };

        window.addEventListener('deviceorientation', this._deviceMotionHandler);
        this._deviceMotionEnabled = true;
    }

    /**
     * Disable device motion tracking
     */
    disableDeviceMotion() {
        if (this._deviceMotionHandler) {
            window.removeEventListener('deviceorientation', this._deviceMotionHandler);
            this._deviceMotionHandler = null;
        }
        this._deviceMotionEnabled = false;
        this._hasBaseOrientation = false;
        return this;
    }

    /**
     * Recalibrate device motion (set current orientation as neutral)
     */
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
        const direction = { x: 0, y: 0, z: 1 };
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
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        this.isLoaded = false;
    }
}

export default SplatViewer;
export { GaussianSplats3D };

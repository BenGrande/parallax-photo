/**
 * SplatViewer - Lightweight 3D Gaussian Splat Viewer
 * 
 * Usage:
 *   const viewer = new SplatViewer('#container', { plyUrl: 'scene.ply' });
 *   await viewer.load();
 *   viewer.pan(10, 0);
 *   viewer.rotate(0.1, 0);
 *   viewer.zoom(-2);
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

            if (this.options.onLoad) this.options.onLoad();
            
            return this;
        } catch (err) {
            if (this.options.onError) this.options.onError(err);
            throw err;
        }
    }

    // Get the Three.js camera
    get camera() {
        return this.viewer?.camera;
    }

    // Get camera position as [x, y, z]
    getCameraPosition() {
        if (!this.camera) return null;
        const p = this.camera.position;
        return [p.x, p.y, p.z];
    }

    // Set camera position
    setCameraPosition(x, y, z) {
        if (!this.camera) return this;
        this.camera.position.set(x, y, z);
        return this;
    }

    // Pan camera (translate in screen space)
    pan(deltaX, deltaY) {
        if (!this.camera) return this;
        
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        
        this.camera.getWorldDirection(new THREE.Vector3());
        right.crossVectors(this.camera.up, this.camera.getWorldDirection(new THREE.Vector3())).normalize();
        up.copy(this.camera.up);

        this.camera.position.addScaledVector(right, -deltaX * this._panSpeed);
        this.camera.position.addScaledVector(up, deltaY * this._panSpeed);
        
        return this;
    }

    // Rotate camera (orbit around look-at point)
    rotate(deltaYaw, deltaPitch) {
        if (!this.viewer?.controls) return this;
        
        // Access the orbit controls if available
        const controls = this.viewer.controls;
        if (controls && controls.rotateLeft && controls.rotateUp) {
            controls.rotateLeft(deltaYaw * this._orbitSpeed);
            controls.rotateUp(deltaPitch * this._orbitSpeed);
            controls.update();
        }
        
        return this;
    }

    // Zoom camera (move along view direction)
    zoom(delta) {
        if (!this.camera) return this;
        
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.camera.position.addScaledVector(direction, delta * this._zoomSpeed);
        
        return this;
    }

    // Reset to initial camera position
    reset() {
        if (!this.camera) return this;
        
        const [x, y, z] = this.options.cameraPosition;
        this.camera.position.set(x, y, z);
        
        const [lx, ly, lz] = this.options.cameraLookAt;
        this.camera.lookAt(lx, ly, lz);
        
        return this;
    }

    // Set orbit/pan/zoom speeds
    setSpeed(orbit = 0.01, pan = 0.1, zoom = 1) {
        this._orbitSpeed = orbit;
        this._panSpeed = pan;
        this._zoomSpeed = zoom;
        return this;
    }

    // Dispose viewer and free resources
    dispose() {
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        this.isLoaded = false;
    }
}

// Also export as default
export default SplatViewer;

// Expose THREE for advanced users
export { GaussianSplats3D };

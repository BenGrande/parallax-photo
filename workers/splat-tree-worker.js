(function(self) {

    let WorkerSplatTreeNodeIDGen = 0;

    class WorkerBox3 {

        constructor(min, max) {
            this.min = [min[0], min[1], min[2]];
            this.max = [max[0], max[1], max[2]];
        }

        containsPoint(point) {
            return point[0] >= this.min[0] && point[0] <= this.max[0] &&
                   point[1] >= this.min[1] && point[1] <= this.max[1] &&
                   point[2] >= this.min[2] && point[2] <= this.max[2];
        }
    }

    class WorkerSplatSubTree {

        constructor(maxDepth, maxCentersPerNode) {
            this.maxDepth = maxDepth;
            this.maxCentersPerNode = maxCentersPerNode;
            this.sceneDimensions = [];
            this.sceneMin = [];
            this.sceneMax = [];
            this.rootNode = null;
            this.addedIndexes = {};
            this.nodesWithIndexes = [];
            this.splatMesh = null;
            this.disposed = false;
        }

    }

    class WorkerSplatTreeNode {

        constructor(min, max, depth, id) {
            this.min = [min[0], min[1], min[2]];
            this.max = [max[0], max[1], max[2]];
            this.center = [(max[0] - min[0]) * 0.5 + min[0],
                           (max[1] - min[1]) * 0.5 + min[1],
                           (max[2] - min[2]) * 0.5 + min[2]];
            this.depth = depth;
            this.children = [];
            this.data = null;
            this.id = id || WorkerSplatTreeNodeIDGen++;
        }

    }

    processSplatTreeNode = function(tree, node, indexToCenter, sceneCenters) {
        const splatCount = node.data.indexes.length;

        if (splatCount < tree.maxCentersPerNode || node.depth > tree.maxDepth) {
            const newIndexes = [];
            for (let i = 0; i < node.data.indexes.length; i++) {
                if (!tree.addedIndexes[node.data.indexes[i]]) {
                    newIndexes.push(node.data.indexes[i]);
                    tree.addedIndexes[node.data.indexes[i]] = true;
                }
            }
            node.data.indexes = newIndexes;
            node.data.indexes.sort((a, b) => {
                if (a > b) return 1;
                else return -1;
            });
            tree.nodesWithIndexes.push(node);
            return;
        }

        const nodeDimensions = [node.max[0] - node.min[0],
                                node.max[1] - node.min[1],
                                node.max[2] - node.min[2]];
        const halfDimensions = [nodeDimensions[0] * 0.5,
                                nodeDimensions[1] * 0.5,
                                nodeDimensions[2] * 0.5];
        const nodeCenter = [node.min[0] + halfDimensions[0],
                            node.min[1] + halfDimensions[1],
                            node.min[2] + halfDimensions[2]];

        const childrenBounds = [
            // top section, clockwise from upper-left (looking from above, +Y)
            new WorkerBox3([nodeCenter[0] - halfDimensions[0], nodeCenter[1], nodeCenter[2] - halfDimensions[2]],
                           [nodeCenter[0], nodeCenter[1] + halfDimensions[1], nodeCenter[2]]),
            new WorkerBox3([nodeCenter[0], nodeCenter[1], nodeCenter[2] - halfDimensions[2]],
                           [nodeCenter[0] + halfDimensions[0], nodeCenter[1] + halfDimensions[1], nodeCenter[2]]),
            new WorkerBox3([nodeCenter[0], nodeCenter[1], nodeCenter[2]],
                           [nodeCenter[0] + halfDimensions[0], nodeCenter[1] + halfDimensions[1], nodeCenter[2] + halfDimensions[2]]),
            new WorkerBox3([nodeCenter[0] - halfDimensions[0], nodeCenter[1], nodeCenter[2]],
                           [nodeCenter[0], nodeCenter[1] + halfDimensions[1], nodeCenter[2] + halfDimensions[2]]),

            // bottom section, clockwise from lower-left (looking from above, +Y)
            new WorkerBox3([nodeCenter[0] - halfDimensions[0], nodeCenter[1] - halfDimensions[1], nodeCenter[2] - halfDimensions[2]],
                           [nodeCenter[0], nodeCenter[1], nodeCenter[2]]),
            new WorkerBox3([nodeCenter[0], nodeCenter[1] - halfDimensions[1], nodeCenter[2] - halfDimensions[2]],
                           [nodeCenter[0] + halfDimensions[0], nodeCenter[1], nodeCenter[2]]),
            new WorkerBox3([nodeCenter[0], nodeCenter[1] - halfDimensions[1], nodeCenter[2]],
                           [nodeCenter[0] + halfDimensions[0], nodeCenter[1], nodeCenter[2] + halfDimensions[2]]),
            new WorkerBox3([nodeCenter[0] - halfDimensions[0], nodeCenter[1] - halfDimensions[1], nodeCenter[2]],
                           [nodeCenter[0], nodeCenter[1], nodeCenter[2] + halfDimensions[2]]),
        ];

        const splatCounts = [];
        const baseIndexes = [];
        for (let i = 0; i < childrenBounds.length; i++) {
            splatCounts[i] = 0;
            baseIndexes[i] = [];
        }

        const center = [0, 0, 0];
        for (let i = 0; i < splatCount; i++) {
            const splatGlobalIndex = node.data.indexes[i];
            const centerBase = indexToCenter[splatGlobalIndex];
            center[0] = sceneCenters[centerBase];
            center[1] = sceneCenters[centerBase + 1];
            center[2] = sceneCenters[centerBase + 2];
            for (let j = 0; j < childrenBounds.length; j++) {
                if (childrenBounds[j].containsPoint(center)) {
                    splatCounts[j]++;
                    baseIndexes[j].push(splatGlobalIndex);
                }
            }
        }

        for (let i = 0; i < childrenBounds.length; i++) {
            const childNode = new WorkerSplatTreeNode(childrenBounds[i].min, childrenBounds[i].max, node.depth + 1);
            childNode.data = {
                'indexes': baseIndexes[i]
            };
            node.children.push(childNode);
        }

        node.data = {};
        for (let child of node.children) {
            processSplatTreeNode(tree, child, indexToCenter, sceneCenters);
        }
        return;
    };

    const buildSubTree = (sceneCenters, maxDepth, maxCentersPerNode) => {

        const sceneMin = [0, 0, 0];
        const sceneMax = [0, 0, 0];
        const indexes = [];
        const centerCount = Math.floor(sceneCenters.length / 4);
        for ( let i = 0; i < centerCount; i ++) {
            const base = i * 4;
            const x = sceneCenters[base];
            const y = sceneCenters[base + 1];
            const z = sceneCenters[base + 2];
            const index = Math.round(sceneCenters[base + 3]);
            if (i === 0 || x < sceneMin[0]) sceneMin[0] = x;
            if (i === 0 || x > sceneMax[0]) sceneMax[0] = x;
            if (i === 0 || y < sceneMin[1]) sceneMin[1] = y;
            if (i === 0 || y > sceneMax[1]) sceneMax[1] = y;
            if (i === 0 || z < sceneMin[2]) sceneMin[2] = z;
            if (i === 0 || z > sceneMax[2]) sceneMax[2] = z;
            indexes.push(index);
        }
        const subTree = new WorkerSplatSubTree(maxDepth, maxCentersPerNode);
        subTree.sceneMin = sceneMin;
        subTree.sceneMax = sceneMax;
        subTree.rootNode = new WorkerSplatTreeNode(subTree.sceneMin, subTree.sceneMax, 0);
        subTree.rootNode.data = {
            'indexes': indexes
        };

        return subTree;
    };

    function createSplatTree(allCenters, maxDepth, maxCentersPerNode) {
        const indexToCenter = [];
        for (let sceneCenters of allCenters) {
            const centerCount = Math.floor(sceneCenters.length / 4);
            for ( let i = 0; i < centerCount; i ++) {
                const base = i * 4;
                const index = Math.round(sceneCenters[base + 3]);
                indexToCenter[index] = base;
            }
        }
        const subTrees = [];
        for (let sceneCenters of allCenters) {
            const subTree = buildSubTree(sceneCenters, maxDepth, maxCentersPerNode);
            subTrees.push(subTree);
            processSplatTreeNode(subTree, subTree.rootNode, indexToCenter, sceneCenters);
        }
        self.postMessage({
            'subTrees': subTrees
        });
    }

    self.onmessage = (e) => {
        if (e.data.process) {
            createSplatTree(e.data.process.centers, e.data.process.maxDepth, e.data.process.maxCentersPerNode);
        }
    };

})(self);

class PriorityQueue {
    constructor() {
        this.values = [];
    }
    
    enqueue(val, priority) {
        const node = { val, priority };
        this.values.push(node);
        this._bubbleUp();
    }
    
    dequeue() {
        if (!this.values.length) return null;
        const min = this.values[0];
        const end = this.values.pop();
        if (this.values.length) {
            this.values[0] = end;
            this._sinkDown();
        }
        return min;
    }
    
    _bubbleUp() {
        let idx = this.values.length - 1;
        const element = this.values[idx];
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const parent = this.values[parentIdx];
            if (element.priority >= parent.priority) break;
            this.values[parentIdx] = element;
            this.values[idx] = parent;
            idx = parentIdx;
        }
    }
    
    _sinkDown() {
        let idx = 0;
        const length = this.values.length;
        const element = this.values[0];
        while (true) {
            const leftChildIdx = 2 * idx + 1;
            const rightChildIdx = 2 * idx + 2;
            let leftChild, rightChild;
            let swap = null;
            
            if (leftChildIdx < length) {
                leftChild = this.values[leftChildIdx];
                if (leftChild.priority < element.priority) {
                    swap = leftChildIdx;
                }
            }
            if (rightChildIdx < length) {
                rightChild = this.values[rightChildIdx];
                if ((swap === null && rightChild.priority < element.priority) || 
                    (swap !== null && rightChild.priority < leftChild.priority)) {
                    swap = rightChildIdx;
                }
            }
            if (swap === null) break;
            this.values[idx] = this.values[swap];
            this.values[swap] = element;
            idx = swap;
        }
    }
}

// Function to reconstruct the path by backtracking from the target
function reconstructPath(predecessors, startNode, targetNode) {
    const path = [];
    let current = targetNode;
    while (current !== null) {
        path.unshift(current);
        if (current === startNode) break;
        current = predecessors[current];
    }
    return path;
}

function dijkstraToTarget(graph, startNode, targetNode) {
    const distances = {};
    const predecessors = {};
    const pq = new PriorityQueue();

    // Initialize distances and predecessors
    for (const vertex in graph) {
        distances[vertex] = Infinity;
        predecessors[vertex] = null;
    }
    distances[startNode] = 0;
    pq.enqueue(startNode, 0);

    while (pq.values.length) {
        const { val: currentVertex, priority: currentDistance } = pq.dequeue();

        // Stop the algorithm as soon as the target is reached
        if (currentVertex === targetNode) {
            const shortestPath = reconstructPath(predecessors, startNode, targetNode);
            const totalDistance = distances[targetNode];
            return { path: shortestPath, distance: totalDistance };
        }

        if (currentDistance > distances[currentVertex]) continue;

        for (const neighbor of graph[currentVertex]) {
            const { node, weight } = neighbor;
            const newDistance = currentDistance + weight;
            if (newDistance < distances[node]) {
                distances[node] = newDistance;
                predecessors[node] = currentVertex;
                pq.enqueue(node, newDistance);
            }
        }
    }

    // If the loop finishes, the target is unreachable
    return { path: null, distance: Infinity };
}


function findTopLeftNode(nodeMap) {
    let min = Infinity;
    let start = null;

    nodeMap.forEach(p => {
        if (Math.hypot(p.x, p.y) < min) {
            min = Math.hypot(p.x, p.y);
            start = p;
        }
    });

    return start;
}

function findTargetNodes(startKey, nodeMap) {
    const targetNodes = [];
    nodeMap.forEach(p => {
        if (!p.visited && p.connections.size == 1) {
            targetNodes.push(p);
        }
    });
    if (targetNodes.length == 0) {
        targetNodes.push(findClosestUnvisitedNode(startKey, nodeMap));
    }
    return targetNodes;
}

function findClosestTarget(startKey, nodeMap, graph) {
    let min = Infinity;
    let target = null;
    let path = null;
    const targetNodes = findTargetNodes(startKey, nodeMap);
    for (const p of targetNodes) {
        if (p) {
            let result = dijkstraToTarget(graph, startKey, p.id);
            if (result.distance < min) {
                min = result.distance;
                target = p;
                path = result.path;
            }
        }
    }
    return { target, path };
}

function findClosestUnvisitedNode(startKey, nodeMap) {
    let min = Infinity;
    let target = null;
    const startNode = nodeMap.get(startKey);

    nodeMap.forEach(p => {
        if (!p.visited && p.id !== startKey) {
            const dist = Math.hypot(p.x - startNode.x, p.y - startNode.y);
            if (dist < min) {
                min = dist;
                target = p;
            }
        }
    });

    return target;
}
function parseJSPolySegmentsToGraph(segments) {
    const nodeMap = new Map(); // Map from "x,y" key to node data
    const graph = {}; // Adjacency list with weights

    // First pass: Create all unique nodes
    for (const segment of segments) {
        const p0Key = `${segment.point0.x.toFixed(1)},${segment.point0.y.toFixed(1)}`;
        const p1Key = `${segment.point1.x.toFixed(1)},${segment.point1.y.toFixed(1)}`;

        if (!nodeMap.has(p0Key)) {
            nodeMap.set(p0Key, {
                id: p0Key,
                x: segment.point0.x,
                y: segment.point0.y,
                r: segment.point0.radius || segment.point0.r || 0,
                connections: new Set()
            });
            graph[p0Key] = [];
        }

        if (!nodeMap.has(p1Key)) {
            nodeMap.set(p1Key, {
                id: p1Key,
                x: segment.point1.x,
                y: segment.point1.y,
                r: segment.point1.radius || segment.point1.r || 0,
                connections: new Set()
            });
            graph[p1Key] = [];
        }

        // Add bidirectional connections and graph edges (only if different nodes)
        if (p0Key !== p1Key) {
            const node0 = nodeMap.get(p0Key);
            const node1 = nodeMap.get(p1Key);

            node0.connections.add(p1Key);
            node1.connections.add(p0Key);

            const distance = Math.hypot(node0.x - node1.x, node0.y - node1.y);

            graph[p0Key].push({ node: p1Key, weight: distance });
            graph[p1Key].push({ node: p0Key, weight: distance });
        }
    }

    return { nodeMap, graph };
}


function findStartNodes(nodeMap) {
    // First collect all potential start nodes as before
    const startNodes = [];
    nodeMap.forEach(n => {
        if (n.connections.size == 1) {
            startNodes.push(n);
        }
    });

    // If no nodes with single connection, use original fallback
    if (startNodes.length == 0) {
        startNodes.push(findTopLeftNode(nodeMap));
        return startNodes;
    }

    if (startNodes.length > 4) {
        // Find bounding box of all start nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        startNodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        });

        // Find nodes closest to each corner of bounding box
        const corners = [
            { x: minX, y: minY }, // Bottom-left
            { x: maxX, y: minY }, // Bottom-right
            { x: minX, y: maxY }, // Top-left
            { x: maxX, y: maxY }  // Top-right
        ];

        const cornerNodes = corners.map(corner => {
            let minDist = Infinity;
            let closestNode = null;

            startNodes.forEach(node => {
                const dist = Math.hypot(node.x - corner.x, node.y - corner.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestNode = node;
                }
            });

            return closestNode;
        });

        // Filter out duplicates while preserving order
        return [...new Set(cornerNodes.filter(node => node !== null))];
    }
    else
        return startNodes;
}

const distanceCache = new Map();

function getCachedDistance(node1, node2) {
    const key = [node1.id, node2.id].sort().join('→');
    if (!distanceCache.has(key)) {
        distanceCache.set(key, Math.hypot(node1.x - node2.x, node1.y - node2.y));
    }
    return distanceCache.get(key);
}

function findBestPath(jspolySegments) {
    const startTime = performance.now();
    if (!jspolySegments || jspolySegments.length === 0) {
        return { toolpath: [], travelDistance: bestCost };
    }

    distanceCache.clear();

    const { nodeMap, graph } = parseJSPolySegmentsToGraph(jspolySegments);

    let startNodes = findStartNodes(nodeMap);
    let bestPath = [];
    let bestCost = Infinity;

    for (const startNode of startNodes) {
        let result = findPossiblePath(nodeMap, graph, startNode);
        if (result.travelDistance < bestCost) {
            bestCost = result.travelDistance;
            bestPath = result.toolpath;
        }
    }

    const endTime = performance.now();
    console.log(`Original path length: ${jspolySegments.length} points`);
    console.log(`Path finding completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Final path length: ${bestPath.length} points`);
    console.log(`Travel distance: ${bestCost.toFixed(2)}`);
    return { toolpath: bestPath, travelDistance: bestCost };

}

function findPossiblePath(nodeMap, graph, startNode) {
    const toolPath = [];
    let travel = 0;
    let node = startNode;

    // Reset visited states
    nodeMap.forEach(n => n.visited = false);

    // Mark start node as visited and add to path
    node.visited = true;
    toolPath.push({ x: node.x, y: node.y, r: node.r });

    let result = findClosestTarget(node.id, nodeMap, graph);

    // Main path finding loop
    while (result.target && result.path?.length > 1) {
        const target = result.target;
        const path = result.path;

        // Process all nodes in current path 
        for (let i = 1; i < path.length; i++) {     
            const nextNode = nodeMap.get(path[i]);
            nextNode.visited = true;
            toolPath.push({ x: nextNode.x, y: nextNode.y, r: nextNode.r });
            travel += getCachedDistance(node, nextNode);
            node = nextNode;
        }
        result = findClosestTarget(node.id, nodeMap, graph);
    }

    // Return to start if needed and possible
    if (startNode.id !== node.id && node.connections.has(startNode.id)) {
        const dx = startNode.x - node.x;
        const dy = startNode.y - node.y;
        travel += Math.hypot(dx, dy);
        toolPath.push({ x: startNode.x, y: startNode.y, r: startNode.r });
    }

    return { toolpath: toolPath, travelDistance: travel };
}









function findOptimalMedialAxisPath(points) {
    if (!points || points.length === 0) return [];
    if (points.length === 1) return points;

    // First, identify spatial groups (points at same location)
    const result = findSpatialGroups(points);
    const graph = result.graph;
    const spatialGroups = result.sites;

    let startNode = findStartNode(graph, spatialGroups);

    var path = findOptimalPath(graph, spatialGroups,startNode);

    return path;
}

function findStartNode(graph, spatialGroups) {
    // Find the node with the smallest y-coordinate (lowest point)
    let startNode = null;
    let minY = Infinity;

    for (const name of graph.keys()) {
        const node = spatialGroups[name];
        if (node.count >= 2) { // start at branch node
            if (node.y < minY) {
                minY = node.y;
                startNode = name;
            }
        }
    }

    if (true || !startNode) { //todo not findind correct start nodes
        // If no start node found, return the first node
        startNode = graph.keys().next().value;
    }
    return startNode;
}

function findSpatialGroups(points) {

    const sites = {};
    const graph = new Map();

    for (let i = 0; i < points.length; i++) {
        let name = points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1);
        var prev = i - 1 < 0 ? points.length - 1 : i - 1;
        var next = i + 1 > points.length - 1 ? 0 : i + 1;
        var before = points[prev].x.toFixed(1) + ',' + points[prev].y.toFixed(1);
        var after = points[next].x.toFixed(1) + ',' + points[next].y.toFixed(1);

        if (sites[name]) {
            sites[name].count++;
            const list = graph.get(name);
            if (list.indexOf(after) === -1) {
                graph.get(name).push(after);
            }
            if (list.indexOf(before) === -1) {
                graph.get(name).push(before);
            }
        }
        else {
            sites[name] = { count: 1, x: points[i].x, y: points[i].y, r: points[i].r };
            graph.set(name, []);
            graph.get(name).push(before);
            graph.get(name).push(after);
        }


    }
    return { sites, graph };
}

// Helper function to calculate distance between two points
function distance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return dx * dx + dy * dy;
}

function findOptimalPath(graphMap, sites, startNode) {


    // Helper function to find score to closest terminal node
    function getScoreToClosestTerminal(startNode, visitedNodes, graphMap, sites) {
        // If this node is already a terminal, return 0
        if (sites[startNode].count === 1) {
            return 0;
        }

        // BFS to find closest unvisited terminal node
        const queue = [[startNode, 0]]; // [node, distance]
        const visited = new Set([startNode]);

        while (queue.length > 0) {
            const [currentNode, currentDistance] = queue.shift();

            // Check if we found an unvisited terminal node
            if (sites[currentNode].count === 1 && !visitedNodes.has(currentNode)) {
                return currentDistance;
            }

            const connections = graphMap.get(currentNode) || [];

            for (const neighbor of connections) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    const neighborPoint = sites[neighbor];
                    const currentPoint = sites[currentNode];
                    const edgeDistance = distance(neighborPoint, currentPoint);
                    queue.push([neighbor, currentDistance + edgeDistance]);
                }
            }
        }

        // If no terminal found, return a large number
        return Infinity;
    }

    // Helper function to convert node name to point
    function nodeToPoint(nodeName) {
        const coords = sites[nodeName];
        return { x: coords.x, y: coords.y, r: coords.r };
    }

    // Get all unique nodes
    const allNodes = new Set();
    for (const [node, connections] of graphMap) {
        allNodes.add(node);
        connections.forEach(conn => allNodes.add(conn));
    }

    // Track visited nodes
    const visitedNodes = new Set();
    const path = [];

    // Start from the first node in the graph
    let currentNode = startNode;
    path.push(nodeToPoint(currentNode));
    visitedNodes.add(currentNode);

    // Continue until all nodes are visited
    while (visitedNodes.size < allNodes.size) {
        const connections = graphMap.get(currentNode) || [];

        // Find unvisited neighbors first
        const unvisitedNeighbors = connections.filter(neighbor => !visitedNodes.has(neighbor));

        let nextNode = null;

        if (unvisitedNeighbors.length > 0) {
            // Choose neighbor that leads to closest terminal node
            let bestScore = Infinity;

            for (const neighbor of unvisitedNeighbors) {
                const score = getScoreToClosestTerminal(neighbor, visitedNodes, graphMap, sites);
                if (score < bestScore) {
                    bestScore = score;
                    nextNode = neighbor;
                }
            }
        } else {
            // No unvisited neighbors, need to find path to nearest unvisited node
            const unvisitedNodes = [...allNodes].filter(node => !visitedNodes.has(node));

            if (unvisitedNodes.length > 0) {
                // Use BFS to find shortest path to any unvisited node
                const pathToUnvisited = findShortestPathToAnyTarget(currentNode, unvisitedNodes, graphMap, sites);

                if (pathToUnvisited && pathToUnvisited.length > 1) {
                    // Add intermediate nodes to path (backtracking)
                    for (let i = 1; i < pathToUnvisited.length; i++) {
                        path.push(nodeToPoint(pathToUnvisited[i]));

                        currentNode = pathToUnvisited[i];
                        if (!visitedNodes.has(currentNode)) {
                            visitedNodes.add(currentNode);
                        }
                    }
                    continue;
                }
            }
        }

        if (nextNode) {
            currentNode = nextNode;
            path.push(nodeToPoint(currentNode));

            visitedNodes.add(currentNode);
        } else {
            // If we can't find a next node, we're done
            break;
        }
    }

    return path;
}

// BFS helper function to find shortest path to any target node
function findShortestPathToAnyTarget(start, targets, graphMap, sites) {
    const queue = [[start]];
    const visited = new Set([start]);
    const targetSet = new Set(targets);

    while (queue.length > 0) {
        const path = queue.shift();
        const currentNode = path[path.length - 1];

        // Check if we reached any target
        if (targetSet.has(currentNode) && currentNode !== start) {
            return path;
        }

        const connections = graphMap.get(currentNode) || [];

        // Sort connections by distance for greedy selection
        const currentPoint = sites[currentNode];
        const sortedConnections = connections.slice().sort((a, b) => {
            const distA = distance(sites[a], currentPoint);
            const distB = distance(sites[b], currentPoint);
            return distA - distB;
        });

        for (const neighbor of sortedConnections) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }

    return null; // No path found
}

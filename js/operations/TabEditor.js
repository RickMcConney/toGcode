class TabEditor extends Select {
    constructor() {
        super('Tabs', 'rectangle-ellipsis');
        this.name = 'Tabs';
        this.icon = 'rectangle-ellipsis';
        this.tooltip = 'Add and position tabs for holding material during cutting';

        this.unselectOnMouseDown = false;
        this.selectedPath = null;
        this.activeTab = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        // Tab handle size in pixels
        this.tabHandleSize = 8;

        // Default properties for new tabs
        this.properties = {
            tabLength: 5,      // MM
            tabHeight: 2,      // MM
            numberOfTabs: 4
        };

        // Load saved properties from localStorage if available
        const stored = localStorage.getItem('tabEditorProperties');
        if (stored) {
            try {
                this.properties = JSON.parse(stored);
            } catch (e) {
                // If parsing fails, keep defaults
                console.error('Failed to parse saved tab properties:', e);
            }
        }

        this.keydownHandler = (evt) => {
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT'
            )) {
                return;
            }

            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                evt.preventDefault();
                evt.stopPropagation();
                this.deleteHoveredTab();
            }
        };
    }

    start() {
        super.start();
        this.selectedPath = null;
        this.activeTab = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        const selected = selectMgr.lastSelected();
        if (selected) {
            this.selectedPath = selected;
        }

        document.addEventListener('keydown', this.keydownHandler);
    }

    stop() {
        super.stop();
        this.selectedPath = null;
        this.activeTab = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    saveProperties() {
        localStorage.setItem('tabEditorProperties', JSON.stringify(this.properties));
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // Check if clicking on a tab handle
        if (this.selectedPath && this.selectedPath.creationProperties && this.selectedPath.creationProperties.tabs) {
            const tabIndex = this.getTabAtPoint(mouse);
            if (tabIndex !== null) {
                this.draggedTab = tabIndex;
                this.hoveredTab = null;  // Clear hover when dragging starts
                addUndo(false, true, false);
                return;
            }
        }

        // If not clicking on a tab, check for path selection
        var clickedPath = closestPath(mouse, false);
        if (clickedPath) {
            selectMgr.unselectAll();
            selectMgr.selectPath(clickedPath);
            this.selectedPath = clickedPath;

            // Auto-generate tabs when a new shape is selected
            this.generateTabs();

            redraw();
        } else {
            selectMgr.unselectAll();
            this.selectedPath = null;
            redraw();
        }
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        this.selectedPath = selectMgr.lastSelected();

        if (this.mouseDown && this.draggedTab !== null && this.selectedPath) {
            // Move tab along path boundary
            this.moveTabAlongPath(this.draggedTab, mouse);
            redraw();
        } else if (!this.mouseDown && this.selectedPath) {
            // Check for hovered tab
            const tabIndex = this.getTabAtPoint(mouse);
            this.hoveredTab = tabIndex;

            if (tabIndex !== null) {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }

            redraw();
        } else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        if (this.draggedTab !== null) {
            this.draggedTab = null;
            redraw();
        }
    }

    getTabAtPoint(point) {
        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return null;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        let closestTab = null;
        let closestDistance = this.tabHandleSize * 3;

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const dx = tab.x - point.x;
            const dy = tab.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= closestDistance) {
                closestDistance = distance;
                closestTab = i;
            }
        }

        return closestTab;
    }

    moveTabAlongPath(tabIndex, targetPoint) {
        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        const path = this.selectedPath.path;

        // Find closest point on path
        const closestPt = this.findClosestPointOnPath(targetPoint);
        if (closestPt) {
            tabs[tabIndex].x = closestPt.x;
            tabs[tabIndex].y = closestPt.y;
            tabs[tabIndex].pathDistance = closestPt.pathDistance;
            tabs[tabIndex].angle = closestPt.angle;
        }
    }

    findClosestPointOnPath(targetPoint) {
        if (!this.selectedPath || !this.selectedPath.path) return null;

        const path = this.selectedPath.path;
        let closestPoint = null;
        let minDistance = Infinity;
        let cumulativeDistance = 0;

        for (let i = 0; i < path.length; i++) {
            const segStart = path[i];
            const segEnd = path[(i + 1) % path.length];

            const closestPt = this.closestPointOnSegment(targetPoint, segStart, segEnd);
            const dx = targetPoint.x - closestPt.x;
            const dy = targetPoint.y - closestPt.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;

                // Calculate angle along the edge direction (segment direction)
                const edgeDx = segEnd.x - segStart.x;
                const edgeDy = segEnd.y - segStart.y;
                const edgeAngle = Math.atan2(edgeDy, edgeDx);
                // Store the angle along the segment direction (not perpendicular)
                const segmentAngle = edgeAngle;

                const segmentLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
                let t = 0;
                if (segmentLength > 0) {
                    t = ((closestPt.x - segStart.x) * edgeDx + (closestPt.y - segStart.y) * edgeDy) / (segmentLength * segmentLength);
                }

                closestPoint = {
                    x: closestPt.x,
                    y: closestPt.y,
                    angle: segmentAngle,
                    pathDistance: cumulativeDistance + segmentLength * Math.max(0, Math.min(1, t))
                };
            }

            const segLen = Math.sqrt((segEnd.x - segStart.x) ** 2 + (segEnd.y - segStart.y) ** 2);
            cumulativeDistance += segLen;
        }

        return closestPoint;
    }

    closestPointOnSegment(point, segStart, segEnd) {
        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
            return { x: segStart.x, y: segStart.y };
        }

        let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));

        return {
            x: segStart.x + t * dx,
            y: segStart.y + t * dy
        };
    }

    calculatePathPerimeter() {
        if (!this.selectedPath || !this.selectedPath.path) return 0;

        const path = this.selectedPath.path;
        let perimeter = 0;

        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            perimeter += Math.sqrt(dx * dx + dy * dy);
        }

        return perimeter;
    }

    isConvex(point1, point2, point3) {
        // Calculate cross product to determine convexity
        const v1x = point2.x - point1.x;
        const v1y = point2.y - point1.y;
        const v2x = point3.x - point2.x;
        const v2y = point3.y - point2.y;

        const crossProduct = v1x * v2y - v1y * v2x;
        return crossProduct > 0; // Positive = convex (left turn)
    }

    generateTabs() {
        if (!this.selectedPath) return;

        const numberOfTabs = Math.max(1, Math.floor(this.properties.numberOfTabs));
        const path = this.selectedPath.path;
        const tabLength = this.properties.tabLength;

        if (path.length < 2) return;

        // Build list of edges with their properties
        const edges = [];
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0) {
                // Calculate convexity at vertex p1
                let isConvex = true;
                if (i > 0 && i < path.length - 1) {
                    const p0 = path[i - 1];
                    isConvex = this.isConvex(p0, p1, p2);
                }

                edges.push({
                    index: i,
                    p1: p1,
                    p2: p2,
                    length: length,
                    dx: dx,
                    dy: dy,
                    isConvex: isConvex
                });
            }
        }

        // Detect if all edges have equal (or nearly equal) length
        // This is common for circles and other regular polygons
        const edgeLengths = edges.map(e => e.length);
        const minLength = Math.min(...edgeLengths);
        const maxLength = Math.max(...edgeLengths);
        const lengthVariance = (maxLength - minLength) / minLength;
        const hasEqualLengthEdges = lengthVariance < 0.05; // Within 5% tolerance

        const tabs = [];
        const tabsPerEdge = [];

        if (hasEqualLengthEdges) {
            // For circles and regular shapes: distribute around perimeter but snap to edge midpoints
            // This keeps tabs spread out around the shape but places them at segment midpoints

            // Calculate total perimeter
            const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);

            // Create list of edge midpoints with their positions
            const edgeMidpoints = [];
            let cumulativeDistance = 0;
            for (const edge of edges) {
                const midpointDistance = cumulativeDistance + edge.length * 0.5;
                edgeMidpoints.push({
                    edge: edge,
                    distance: midpointDistance,
                    positionFraction: 0.5
                });
                cumulativeDistance += edge.length;
            }

            // Calculate evenly-spaced target positions around perimeter
            const targetPositions = [];
            for (let tabIdx = 0; tabIdx < numberOfTabs; tabIdx++) {
                const targetDistance = ((tabIdx + 0.5) / numberOfTabs) * perimeter;
                targetPositions.push(targetDistance);
            }

            // For each target position, find the nearest edge midpoint
            const usedMidpoints = new Set();
            for (const targetDistance of targetPositions) {
                let nearestMidpoint = edgeMidpoints[0];
                let minDistDiff = Math.abs(edgeMidpoints[0].distance - targetDistance);

                // Find the nearest midpoint to this target position
                for (const midpoint of edgeMidpoints) {
                    const distDiff = Math.abs(midpoint.distance - targetDistance);
                    if (distDiff < minDistDiff) {
                        minDistDiff = distDiff;
                        nearestMidpoint = midpoint;
                    }
                }

                // Check if we've already placed a tab at this midpoint
                // If so, find the next nearest one
                if (usedMidpoints.has(nearestMidpoint)) {
                    for (const midpoint of edgeMidpoints) {
                        if (!usedMidpoints.has(midpoint)) {
                            const distDiff = Math.abs(midpoint.distance - targetDistance);
                            if (distDiff < minDistDiff) {
                                minDistDiff = distDiff;
                                nearestMidpoint = midpoint;
                            }
                        }
                    }
                }

                usedMidpoints.add(nearestMidpoint);
                const edge = nearestMidpoint.edge;
                const p1 = edge.p1;
                const p2 = edge.p2;

                // Place at midpoint (0.5 fraction)
                const positionFraction = 0.5;
                const tabX = p1.x + positionFraction * (p2.x - p1.x);
                const tabY = p1.y + positionFraction * (p2.y - p1.y);

                // Calculate angle along the edge direction
                const edgeAngle = Math.atan2(edge.dy, edge.dx);
                const segmentAngle = edgeAngle;

                // Calculate cumulative distance along path for this tab
                let pathDistance = 0;
                for (let i = 0; i < edge.index; i++) {
                    const e = edges[i];
                    pathDistance += Math.sqrt(e.dx * e.dx + e.dy * e.dy);
                }
                pathDistance += edge.length * positionFraction;

                tabs.push({
                    x: tabX,
                    y: tabY,
                    angle: segmentAngle,
                    pathDistance: pathDistance,
                    isConvex: edge.isConvex,
                    edgeIndex: edge.index,
                    edgeP1: { x: p1.x, y: p1.y },
                    edgeP2: { x: p2.x, y: p2.y },
                    positionFraction: positionFraction
                });

                tabsPerEdge.push({ edge: edge, count: 1 });
            }
        } else {
            // For irregular shapes: use edge-length-based distribution
            // Sort edges by length (longest first) for prioritized tab placement
            const sortedEdges = [...edges].sort((a, b) => b.length - a.length);

            // Distribute tabs evenly, prioritizing longer edges
            let remainingTabs = numberOfTabs;

            for (let edgeIdx = 0; edgeIdx < sortedEdges.length && remainingTabs > 0; edgeIdx++) {
                const edge = sortedEdges[edgeIdx];
                const minTabsForEdge = Math.max(1, Math.floor(tabLength * viewScale));

                // Calculate max tabs this edge can hold (need at least minTabsForEdge spacing between tabs)
                const maxTabsOnEdge = Math.max(1, Math.floor(edge.length / (tabLength * viewScale)));

                // Calculate how many edges we still need to fill
                const remainingEdges = sortedEdges.length - edgeIdx;

                // Distribute remaining tabs across remaining edges
                const tabsForThisEdge = Math.min(
                    maxTabsOnEdge,
                    Math.max(1, Math.ceil(remainingTabs / remainingEdges))
                );

                tabsPerEdge.push({
                    edge: edge,
                    count: tabsForThisEdge
                });

                remainingTabs -= tabsForThisEdge;
            }

            // Place tabs on each edge
            for (const tabAssignment of tabsPerEdge) {
                const edge = tabAssignment.edge;
                const count = tabAssignment.count;

                // Calculate positions along the edge for all tabs
                for (let tabNum = 0; tabNum < count; tabNum++) {
                    // Position along edge: distribute evenly
                    // For 1 tab: 0.5 (middle)
                    // For 2 tabs: 0.33 and 0.67
                    // For 3 tabs: 0.25, 0.5, 0.75
                    const positionFraction = (tabNum + 1) / (count + 1);

                    const p1 = edge.p1;
                    const p2 = edge.p2;

                    // Calculate position along edge
                    const tabX = p1.x + positionFraction * (p2.x - p1.x);
                    const tabY = p1.y + positionFraction * (p2.y - p1.y);

                    // Calculate angle along the edge direction (segment direction)
                    const edgeAngle = Math.atan2(edge.dy, edge.dx);
                    // Store the angle along the segment direction (not perpendicular)
                    const segmentAngle = edgeAngle;

                    // Calculate cumulative distance along path for this tab
                    let pathDistance = 0;
                    for (let i = 0; i < edge.index; i++) {
                        const e = edges[i];
                        pathDistance += Math.sqrt(e.dx * e.dx + e.dy * e.dy);
                    }
                    pathDistance += edge.length * positionFraction;

                    tabs.push({
                        x: tabX,
                        y: tabY,
                        angle: segmentAngle,
                        pathDistance: pathDistance,
                        isConvex: edge.isConvex,
                        // Store edge information to match tabs to path segments
                        edgeIndex: edge.index,
                        edgeP1: { x: p1.x, y: p1.y },
                        edgeP2: { x: p2.x, y: p2.y },
                        positionFraction: positionFraction
                    });
                }
            }
        }

        // Calculate effective tab length based on edge constraints
        // For irregular shapes only - constrain to avoid consuming edge entirely
        // For equal-length edges (circles), use full tabLength without constraint
        const tabLengthWorld = this.properties.tabLength * viewScale;
        let effectiveTabLengthWorld = tabLengthWorld;

        if (!hasEqualLengthEdges) {
            // For irregular shapes: constrain tabs to 80% of edge length
            for (const tabAssignment of tabsPerEdge) {
                const edge = tabAssignment.edge;
                const count = tabAssignment.count;

                // Maximum tab length in world units for this edge
                // Tabs should not consume more than 80% of edge length
                // If we have N tabs on an edge, all N tabs combined should be <= 0.8 * edge.length
                // So each tab can be at most: (edge.length * 0.8) / count
                const maxTabLengthWorldForEdge = (edge.length * 0.8) / count;

                if (maxTabLengthWorldForEdge < effectiveTabLengthWorld) {
                    effectiveTabLengthWorld = maxTabLengthWorldForEdge;
                }
            }
        }

        // Convert back to MM for storage
        const effectiveTabLengthMM = effectiveTabLengthWorld / viewScale;

        // Store tabs in creation properties
        if (!this.selectedPath.creationProperties) {
            this.selectedPath.creationProperties = {};
        }

        this.selectedPath.creationProperties.tabLength = effectiveTabLengthMM;
        this.selectedPath.creationProperties.tabHeight = this.properties.tabHeight;
        this.selectedPath.creationProperties.numberOfTabs = this.properties.numberOfTabs;
        this.selectedPath.creationProperties.tabs = tabs;

        addUndo(false, true, false);
        redraw();
    }

    deleteHoveredTab() {
        if (!this.selectedPath || this.hoveredTab === null) return;

        if (!this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        if (tabs.length <= 0) return;

        addUndo(false, true, false);
        tabs.splice(this.hoveredTab, 1);
        this.hoveredTab = null;

        redraw();
    }

    draw(ctx) {
        super.draw(ctx);

        this.selectedPath = selectMgr.lastSelected();

        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        const tabLength = this.selectedPath.creationProperties.tabLength || this.properties.tabLength;
        const tabHeight = this.selectedPath.creationProperties.tabHeight || this.properties.tabHeight;

        ctx.save();

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const screenCenter = worldToScreen(tab.x, tab.y);

            // Convert MM to world units
            const tabLengthWorld = tabLength * viewScale;
            const tabHeightWorld = tabHeight * viewScale;

            // Convert to screen units
            const tabLengthScreen = tabLengthWorld * zoomLevel;
            const tabHeightScreen = tabHeightWorld * zoomLevel;

            // Save and transform
            ctx.save();
            ctx.translate(screenCenter.x, screenCenter.y);
            // Rotate to align with segment direction (tab.angle is now the segment angle directly)
            ctx.rotate(tab.angle);

            // Draw rectangle
            // Now: width (x-axis) = length along path, height (y-axis) = height perpendicular to path
            ctx.fillStyle = tab.isConvex ? 'rgba(100, 150, 255, 0.6)' : 'rgba(255, 150, 100, 0.6)';

            if (this.draggedTab === i) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            } else if (this.hoveredTab === i) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
            }

            ctx.fillRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

            // Draw outline
            ctx.strokeStyle = this.draggedTab === i ? '#ff0000' : (this.hoveredTab === i ? '#ffff00' : '#0080ff');
            ctx.lineWidth = 2;
            ctx.strokeRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

            ctx.restore();

            // Draw center handle
            ctx.beginPath();
            ctx.arc(screenCenter.x, screenCenter.y, this.tabHandleSize, 0, Math.PI * 2);
            ctx.fillStyle = this.draggedTab === i ? '#ff0000' : (this.hoveredTab === i ? '#ffff00' : '#0080ff');
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }

    getPropertiesHTML() {
        this.selectedPath = selectMgr.lastSelected();

        let html = `
            <div class="alert alert-info mb-3">
                <i data-lucide="rectangle-ellipsis"></i>
                <strong>Tab Editor</strong>
        `;

        if (this.selectedPath) {
            const tabCount = (this.selectedPath.creationProperties && this.selectedPath.creationProperties.tabs)
                ? this.selectedPath.creationProperties.tabs.length
                : 0;
            html += `<br>Path: ${this.selectedPath.name}<br>Tabs: ${tabCount}`;
        }

        html += `
            </div>
            <div class="mb-3">
                <label class="form-label"><i data-lucide="ruler"></i> Tab Length (MM)</label>
                <input type="number" class="form-control" id="tabLength" name="tabLength" min="0.5" step="0.5" value="${this.properties.tabLength}">
            </div>
            <div class="mb-3">
                <label class="form-label"><i data-lucide="maximize-2"></i> Tab Height (MM)</label>
                <input type="number" class="form-control" id="tabHeight" name="tabHeight" min="0.5" step="0.5" value="${this.properties.tabHeight}">
            </div>
            <div class="mb-3">
                <label class="form-label"><i data-lucide="copy"></i> Number of Tabs</label>
                <input type="number" class="form-control" id="numberOfTabs" name="numberOfTabs" min="1" step="1" value="${this.properties.numberOfTabs}">
            </div>
            <button class="btn btn-primary btn-sm w-100 mb-2" id="generateTabsBtn">
                <i data-lucide="plus"></i> Generate Tabs
            </button>
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Tab Editor:</strong><br>
                    • <strong>Generate Tabs:</strong> Creates tabs evenly spaced around selected path<br>
                    • <strong>Drag</strong> tab handles to reposition along path<br>
                    • <strong>Hover + Delete</strong> key to remove a tab<br>
                    • Blue tabs = convex surface, Orange tabs = concave surface
                </small>
            </div>
        `;

        return html;
    }

    updateFromProperties(data) {
        this.properties.tabLength = parseFloat(data.tabLength) || 5;
        this.properties.tabHeight = parseFloat(data.tabHeight) || 2;
        this.properties.numberOfTabs = parseInt(data.numberOfTabs) || 4;
        this.saveProperties();
    }

    onPropertiesChanged(data) {
        this.updateFromProperties(data);
    }
}

function interpolatePointOnSegment(p1, p2, distanceFraction) {
	// distanceFraction: 0-1, where 0 is at p1 and 1 is at p2
	return {
		x: p1.x + distanceFraction * (p2.x - p1.x),
		y: p1.y + distanceFraction * (p2.y - p1.y)
	};
}

function intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale) {
	// Find intersections between a segment and the RED ENDS of a tab box
	// RED ENDS are the perpendicular faces at ±(tabLength/2) along the tab direction
	//
	// Returns array of {distance: t, type: 'enter'/'exit'} where t is position along segment
	// distance = 0 at p1, distance = 1 at p2

	const intersections = [];
	const isTab0 = Math.abs(tab.angle - 2.0943951022854153) < 0.01; // Detect Tab 0 by angle

	// Convert tab length to world units
	const tabLengthWorld = tabLength * viewScale;
	const halfTabLength = tabLengthWorld / 2;
	const boxWidthWorld = 4 * toolRadius;
	const halfBoxWidth = boxWidthWorld / 2;

	// Direction vector along the path (tab angle)
	const dirX = Math.cos(tab.angle);
	const dirY = Math.sin(tab.angle);

	// Perpendicular vector (90 degrees counterclockwise from direction)
	const perpX = -Math.sin(tab.angle);
	const perpY = Math.cos(tab.angle);

	// Project tab center onto direction vector
	const tabCenterAlongDir = tab.x * dirX + tab.y * dirY;

	// Define the two red end positions along the direction vector
	const leftEndPos = tabCenterAlongDir - halfTabLength;
	const rightEndPos = tabCenterAlongDir + halfTabLength;

	// Project segment endpoints onto direction and perpendicular vectors
	// RELATIVE to the tab center
	const p1RelX = p1.x - tab.x;
	const p1RelY = p1.y - tab.y;
	const p1AlongDir = tabCenterAlongDir + (p1RelX * dirX + p1RelY * dirY);
	const p1PerpDist = p1RelX * perpX + p1RelY * perpY;

	const p2RelX = p2.x - tab.x;
	const p2RelY = p2.y - tab.y;
	const p2AlongDir = tabCenterAlongDir + (p2RelX * dirX + p2RelY * dirY);
	const p2PerpDist = p2RelX * perpX + p2RelY * perpY;

	// CHECK FOR FULL-SEGMENT CONTAINMENT FIRST
	// If entire segment is inside the tab zone, don't create spurious markers
	// Check both endpoints and midpoint to determine if fully contained
	const midAlongDir = (p1AlongDir + p2AlongDir) / 2;
	const midPerpDist = (p1PerpDist + p2PerpDist) / 2;

	const p1Inside = p1AlongDir >= leftEndPos && p1AlongDir <= rightEndPos && Math.abs(p1PerpDist) <= halfBoxWidth;
	const p2Inside = p2AlongDir >= leftEndPos && p2AlongDir <= rightEndPos && Math.abs(p2PerpDist) <= halfBoxWidth;
	const midInside = midAlongDir >= leftEndPos && midAlongDir <= rightEndPos && Math.abs(midPerpDist) <= halfBoxWidth;

	if (p1Inside && p2Inside && midInside) {
		// Entire segment is fully contained within tab zone
		// Return special marker so calculateTabMarkers can skip creating redundant markers
		return [
			{ distance: 0, type: 'fullSegment', isFullSegment: true }
		];
	}

	// Check if segment is parallel to direction
	const alongDiff = p2AlongDir - p1AlongDir;
	const isParallel = Math.abs(alongDiff) < 1e-10;

	if (isParallel) {
		// Segment is parallel to the tab direction - can't cross red ends
		return []; // No intersection possible
	}

	// Segment is NOT parallel - find intersections with red end planes

	// Check intersection with LEFT red end (at leftEndPos)
	const tLeft = (leftEndPos - p1AlongDir) / alongDiff;
	if (tLeft >= 0 && tLeft <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tLeft * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tLeft,
				type: 'enter',
				perpDist: intersectPerpDist
			});
		}
	}

	// Check intersection with RIGHT red end (at rightEndPos)
	const tRight = (rightEndPos - p1AlongDir) / alongDiff;
	if (tRight >= 0 && tRight <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tRight * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tRight,
				type: 'exit',
				perpDist: intersectPerpDist
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);

	// Cleanup - remove perpDist from return (was just for calculation)
	return intersections.map(int => ({
		distance: int.distance,
		type: int.type,
		isFullSegment: int.isFullSegment || false
	}));
}


function findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength) {
	// Find where segment from p1 to p2 intersects tab zones using oriented bounding boxes
	//
	// Approach: For each tab, create an oriented bounding box that extends:
	// - Along tab.angle: tabLength (the actual tab length)
	// - Perpendicular: accounts for tool radius AND path offset mismatch
	//
	// The key insight: tabs are marked on the original path, but cutting happens on an
	// offset path (for inside/outside operations). The detection box must account for this!
	//
	// Returns array of {distance, type, tabIndex} sorted by distance
	// distance: 0-1 fraction along segment from p1 to p2

	if (!tabs || tabs.length === 0) {
		return [];
	}

	const intersections = [];

	for (let tabIdx = 0; tabIdx < tabs.length; tabIdx++) {
		const tab = tabs[tabIdx];

		// Find intersections with this tab's RED ENDS
		const boxIntersections = intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale);

		// Add intersections to results with tab index
		for (let i = 0; i < boxIntersections.length; i++) {
			intersections.push({
				distance: boxIntersections[i].distance,
				type: boxIntersections[i].type,
				tabIndex: tabIdx,
				isFullSegment: boxIntersections[i].isFullSegment || false
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);


	return intersections;
}

function walkSegments(toolpath, startSegIdx, startT, distanceNeeded, forward = true) {
	// Walk through segments in specified direction accumulating distance
	// forward = true: walk forward through segments
	// forward = false: walk backward through segments
	// Returns {segmentIndex, t} where the target distance is reached
	// Handles multi-segment offset when marker crosses segment boundaries

	let remainingDist = distanceNeeded;
	let currentSegIdx = startSegIdx;
	let currentT = startT;

	// Start by consuming remaining distance in current segment
	const p1_start = toolpath[currentSegIdx];
	const p2_start = toolpath[currentSegIdx + 1];
	const startSegDx = p2_start.x - p1_start.x;
	const startSegDy = p2_start.y - p1_start.y;
	const startSegLen = Math.sqrt(startSegDx * startSegDx + startSegDy * startSegDy);

	const distInCurrentSegment = forward ? (1 - currentT) * startSegLen : currentT * startSegLen;

	if (distInCurrentSegment >= remainingDist) {
		// Offset fits within current segment
		if (forward) {
			currentT += (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.min(1, currentT) };
		} else {
			currentT -= (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.max(0, currentT) };
		}
	}

	// Not enough space in current segment, move to next/previous segments
	remainingDist -= distInCurrentSegment;
	if (forward) {
		currentSegIdx++;
		currentT = 0;
	} else {
		currentSegIdx--;
		currentT = 1;
	}

	// Walk through subsequent/previous segments (with wraparound for closed paths)
	let segmentsWalked = 0;
	const maxSegments = toolpath.length - 1; // Maximum segments before stopping

	while (remainingDist > 0 && segmentsWalked < maxSegments) {
		// Handle wraparound
		if (forward) {
			if (currentSegIdx >= toolpath.length - 1) {
				currentSegIdx = 0; // Wrap to first segment
				currentT = 0;
			}
		} else {
			if (currentSegIdx < 0) {
				currentSegIdx = toolpath.length - 2; // Wrap to last segment
				currentT = 1;
			}
		}

		const p1 = toolpath[currentSegIdx];
		const p2 = toolpath[currentSegIdx + 1];
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const segLen = Math.sqrt(dx * dx + dy * dy);

		if (segLen >= remainingDist) {
			// Offset ends in this segment
			if (forward) {
				currentT = remainingDist / segLen;
			} else {
				currentT = 1 - (remainingDist / segLen);
			}
			return { segmentIndex: currentSegIdx, t: currentT };
		}

		// Use entire segment, continue to next/previous
		remainingDist -= segLen;
		if (forward) {
			currentSegIdx++;
		} else {
			currentSegIdx--;
		}
		segmentsWalked++;
	}

	// Reached maximum segments or accumulated distance - return current position
	if (segmentsWalked >= maxSegments) {
		const wrapIdx = forward ?
			(currentSegIdx >= toolpath.length - 1 ? 0 : currentSegIdx) :
			(currentSegIdx < 0 ? toolpath.length - 2 : currentSegIdx);
		return { segmentIndex: wrapIdx, t: currentT };
	}

	return { segmentIndex: currentSegIdx, t: currentT };
}

function isPathCounterClockwise(toolpath) {
	// Detect path direction using signed area (shoelace formula)
	// Returns true for counter-clockwise, false for clockwise
	// Positive area = counter-clockwise, negative = clockwise

	if (!toolpath || toolpath.length < 3) return false;

	let signedArea = 0;
	for (let i = 0; i < toolpath.length; i++) {
		const p1 = toolpath[i];
		const p2 = toolpath[(i + 1) % toolpath.length];
		signedArea += (p2.x - p1.x) * (p2.y + p1.y);
	}

	return signedArea > 0;
}

function calculateTabMarkers(toolpath, tabs, tabLength, toolRadius, viewScale) {
	// Calculate all tab lift/lower markers with tool radius offset
	// Returns array of {x, y, type: 'lift'|'lower', segmentIndex, t}
	// Handles multi-segment offsets when tabs are near segment boundaries
	// Handles bidirectional path traversal (clockwise and counter-clockwise)

	if (!tabs || tabs.length === 0 || !toolpath || toolpath.length < 2) return [];

	const markers = [];

	// Detect path direction: true = counter-clockwise (inside cuts), false = clockwise (outside cuts)
	const isCounterClockwise = isPathCounterClockwise(toolpath);

	// For each segment in toolpath
	for (let segIdx = 0; segIdx < toolpath.length - 1; segIdx++) {
		const p1 = toolpath[segIdx];
		const p2 = toolpath[segIdx + 1];

		// Find intersections with tab red ends on this segment
		const intersections = findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength);

		if (intersections.length > 0) {
			// Check if this is a fully-contained segment (shouldn't create markers)
			const isFullSegment = intersections.some(int => int.isFullSegment);

			if (isFullSegment) {
				// Segment is entirely inside tab zone - skip marker creation
				// The persistent lifted state will handle traversal
				continue;
			}

			// Flip entry/exit types for counter-clockwise paths (inside cuts)
			// For counter-clockwise traversal, entry and exit are reversed
			if (isCounterClockwise) {
				for (let int of intersections) {
					if (int.type === 'enter') {
						int.type = 'exit';
					} else if (int.type === 'exit') {
						int.type = 'enter';
					}
				}
			}

			// Process intersections - handle both pairs and single intersections
			for (let intIdx = 0; intIdx < intersections.length; intIdx++) {
				const currentInt = intersections[intIdx];
				const nextInt = intersections[intIdx + 1];

				if (currentInt.type === 'enter') {
					// Check if followed by exit
					if (nextInt && nextInt.type === 'exit') {
						// Paired entry/exit - create both markers
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});

						const lowerMarker = walkSegments(toolpath, segIdx, nextInt.distance, toolRadius, true);
						const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
						markers.push({
							x: lowerPt.x,
							y: lowerPt.y,
							type: 'lower',
							segmentIndex: lowerMarker.segmentIndex,
							t: lowerMarker.t
						});

						intIdx++; // Skip the next intersection since we processed it
					} else {
						// Single entry (exit is on a later segment) - create only lift marker
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});
					}
				} else if (currentInt.type === 'exit') {
					// Single exit (entry was on a previous segment) - create only lower marker
					const lowerMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, true);
					const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
					markers.push({
						x: lowerPt.x,
						y: lowerPt.y,
						type: 'lower',
						segmentIndex: lowerMarker.segmentIndex,
						t: lowerMarker.t
					});
				}
			}
		}
	}

	return markers;
}

function augmentToolpathWithMarkers(toolpath, markers) {
	// Create augmented toolpath by inserting marker points
	// Splits segments where markers occur
	// Returns new array: original points with markers inserted at appropriate positions

	if (markers.length === 0) return toolpath.slice();

	const augmentedPath = [];

	// For each segment
	for (let segIdx = 0; segIdx < toolpath.length; segIdx++) {
		const point = toolpath[segIdx];

		// Add the current point
		augmentedPath.push(point);

		// If not the last point, check for markers on this segment
		if (segIdx < toolpath.length - 1) {
			// Find all markers for this segment, sorted by t value
			const segmentMarkers = markers
				.filter(m => m.segmentIndex === segIdx)
				.sort((a, b) => a.t - b.t);

			// Add all markers for this segment
			for (const marker of segmentMarkers) {
				augmentedPath.push({
					x: marker.x,
					y: marker.y,
					marker: marker.type  // 'lift' or 'lower'
				});
			}
		}
	}

	return augmentedPath;
}

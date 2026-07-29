import { GraphNode } from './GraphNode';
import { GraphEdge } from './GraphEdge';
import { Transfer } from './Transfer';

export class TransitGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private adjacency: Map<string, Map<string, GraphEdge[]>> = new Map();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Map());
    }
  }

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
    const fromAdj = this.adjacency.get(edge.from);
    if (fromAdj) {
      const edges = fromAdj.get(edge.to) || [];
      edges.push(edge);
      fromAdj.set(edge.to, edges);
    }
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  findNearestNodes(lat: number, lng: number, limit: number = 10): GraphNode[] {
    const withDistance = Array.from(this.nodes.values()).map((node) => {
      const d = this.haversineDistance(
        lat,
        lng,
        node.coordinates.lat,
        node.coordinates.lng,
      );
      return { node, distance: d };
    });
    withDistance.sort((a, b) => a.distance - b.distance);
    return withDistance.slice(0, limit).map((n) => n.node);
  }

  findRoutesBetween(fromId: string, toId: string): GraphEdge[][] {
    const paths: GraphEdge[][] = [];
    const visited = new Set<string>();
    this.dfs(fromId, toId, visited, [], paths);
    return paths.sort((a, b) => {
      const wa = a.reduce((s, e) => s + e.weight, 0);
      const wb = b.reduce((s, e) => s + e.weight, 0);
      return wa - wb;
    });
  }

  createTransfer(from: GraphNode, to: GraphNode, mode: Transfer['mode']): void {
    const distance = this.haversineDistance(
      from.coordinates.lat,
      from.coordinates.lng,
      to.coordinates.lat,
      to.coordinates.lng,
    );
    const speed = mode === 'WALKING' ? 1.4 : 8.33;
    const duration = Math.round(distance / speed);
    const edge: GraphEdge = {
      id: `transfer_${from.id}_${to.id}`,
      from: from.id,
      to: to.id,
      weight: duration,
      mode,
      properties: { distanceMeters: Math.round(distance) },
    };
    this.addEdge(edge);
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private dfs(
    current: string,
    target: string,
    visited: Set<string>,
    path: GraphEdge[],
    paths: GraphEdge[][],
  ): void {
    if (current === target) {
      paths.push([...path]);
      return;
    }
    visited.add(current);
    const adj = this.adjacency.get(current);
    if (adj) {
      for (const [, edges] of adj) {
        for (const edge of edges) {
          if (!visited.has(edge.to)) {
            path.push(edge);
            this.dfs(edge.to, target, visited, path, paths);
            path.pop();
          }
        }
      }
    }
    visited.delete(current);
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }
}

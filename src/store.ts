import type { Vec2 } from './camera';
import {
  type CircuitNode,
  type CircuitState,
  type NodeType,
  type Pin,
  type PinRef,
  type Wire,
  createPins,
  pinWorldPos,
} from './model';

/**
 * Store em memória do circuito. Mantém nós e fios e oferece operações de
 * edição. Não há persistência nesta etapa — o estado vive apenas em memória.
 */
export class CircuitStore {
  private nodes = new Map<string, CircuitNode>();
  private wires = new Map<string, Wire>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  /** Cria e adiciona um nó do tipo informado na posição (mundo) dada. */
  addNode(type: NodeType, pos: Vec2): CircuitNode {
    const node: CircuitNode = {
      id: this.nextId('n'),
      type,
      pos: { ...pos },
      pins: createPins(type),
    };
    this.nodes.set(node.id, node);
    return node;
  }

  /** Remove um nó e todos os fios conectados a ele. */
  removeNode(nodeId: string): void {
    if (!this.nodes.delete(nodeId)) return;
    for (const wire of [...this.wires.values()]) {
      if (wire.from.nodeId === nodeId || wire.to.nodeId === nodeId) {
        this.wires.delete(wire.id);
      }
    }
  }

  /** Cria e adiciona um fio de um pino de saída para um pino de entrada. */
  addWire(from: PinRef, to: PinRef): Wire {
    const wire: Wire = { id: this.nextId('w'), from, to };
    this.wires.set(wire.id, wire);
    return wire;
  }

  removeWire(wireId: string): void {
    this.wires.delete(wireId);
  }

  getNode(nodeId: string): CircuitNode | undefined {
    return this.nodes.get(nodeId);
  }

  getPin(ref: PinRef): Pin | undefined {
    return this.nodes.get(ref.nodeId)?.pins.find((p) => p.id === ref.pinId);
  }

  /** Posição absoluta (mundo) de um pino referenciado, se existir. */
  pinPos(ref: PinRef): Vec2 | undefined {
    const node = this.nodes.get(ref.nodeId);
    const pin = node?.pins.find((p) => p.id === ref.pinId);
    if (!node || !pin) return undefined;
    return pinWorldPos(node, pin);
  }

  /** Verdadeiro se já existe um fio chegando ao pino de entrada dado. */
  isInputOccupied(ref: PinRef): boolean {
    for (const wire of this.wires.values()) {
      if (wire.to.nodeId === ref.nodeId && wire.to.pinId === ref.pinId) {
        return true;
      }
    }
    return false;
  }

  listNodes(): CircuitNode[] {
    return [...this.nodes.values()];
  }

  listWires(): Wire[] {
    return [...this.wires.values()];
  }

  /** Snapshot serializável do estado atual. */
  toJSON(): CircuitState {
    return { nodes: this.listNodes(), wires: this.listWires() };
  }
}

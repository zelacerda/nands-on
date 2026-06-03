import type { Vec2 } from './camera';
import {
  type ChipDefinition,
  type CircuitNode,
  type CircuitState,
  type Pin,
  type PinRef,
  type PrimitiveType,
  type Wire,
  chipInstancePins,
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

  /** Cria e adiciona uma primitiva (NAND/I/O) na posição (mundo) dada. */
  addNode(type: PrimitiveType, pos: Vec2): CircuitNode {
    const node: CircuitNode = {
      id: this.nextId('n'),
      type,
      pos: { ...pos },
      pins: createPins(type),
    };
    this.nodes.set(node.id, node);
    return node;
  }

  /** Cria e adiciona uma instância de chip a partir de uma definição. */
  addChipInstance(def: ChipDefinition, pos: Vec2): CircuitNode {
    const node: CircuitNode = {
      id: this.nextId('n'),
      type: 'chip',
      pos: { ...pos },
      pins: chipInstancePins(def),
      defId: def.id,
      name: def.name,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  /** Remove todos os nós e fios (usado após "Fazer" um chip). */
  clear(): void {
    this.nodes.clear();
    this.wires.clear();
  }

  /** Quantidade de nós de um dado tipo (ex.: para condicionar o botão "Fazer"). */
  countByType(type: CircuitNode['type']): number {
    let n = 0;
    for (const node of this.nodes.values()) if (node.type === type) n += 1;
    return n;
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

  /**
   * Alterna o estado booleano de um nó `input`. No-op para outros tipos de nó.
   * Retorna o novo valor, ou `undefined` se o nó não existir ou não for `input`.
   */
  toggleNodeValue(nodeId: string): boolean | undefined {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'input') return undefined;
    node.value = !node.value;
    return node.value;
  }

  /** Define o estado booleano de um nó `input`. No-op para outros tipos. */
  setNodeValue(nodeId: string, value: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node && node.type === 'input') node.value = value;
  }

  /**
   * Define o nome (rótulo) de um nó `input`/`output`. Nome vazio (após trim)
   * remove o nome, voltando ao rótulo padrão. No-op para outros tipos de nó.
   */
  setNodeName(nodeId: string, name: string): void {
    const node = this.nodes.get(nodeId);
    if (node && (node.type === 'input' || node.type === 'output')) {
      node.name = name.trim() || undefined;
    }
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

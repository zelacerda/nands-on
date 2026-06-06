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
  private topoVersion = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  /**
   * Versão da **topologia** (nós e fios). Incrementa apenas em mudanças
   * estruturais — não em mudanças de valor/modo de entrada nem de rótulo. A
   * camada de simulação usa isto para recompilar o netlist só quando necessário,
   * preservando a memória de runtime (latches) entre alternâncias de entrada.
   */
  get topologyVersion(): number {
    return this.topoVersion;
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
    this.topoVersion += 1;
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
    this.topoVersion += 1;
    return node;
  }

  /** Remove todos os nós e fios (usado após "Fazer" um chip). */
  clear(): void {
    this.nodes.clear();
    this.wires.clear();
    this.topoVersion += 1;
  }

  /**
   * Substitui o conteúdo do espaço pelo estado dado (ex.: abrir um chip para
   * edição, ou restaurar o espaço ao concluir). Faz cópia profunda para não
   * compartilhar referências com a origem, e avança o contador de ids para além
   * dos ids carregados, evitando colisão ao criar novos nós/fios depois.
   */
  loadState(state: CircuitState): void {
    const copy = structuredClone(state);
    this.nodes = new Map(copy.nodes.map((n) => [n.id, n]));
    this.wires = new Map(copy.wires.map((w) => [w.id, w]));
    this.seq = 0;
    for (const id of [...this.nodes.keys(), ...this.wires.keys()]) {
      const m = /^[nw](\d+)$/.exec(id);
      if (m) this.seq = Math.max(this.seq, Number(m[1]));
    }
    this.topoVersion += 1;
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
    this.topoVersion += 1;
  }

  /** Cria e adiciona um fio de um pino de saída para um pino de entrada. */
  addWire(from: PinRef, to: PinRef): Wire {
    const wire: Wire = { id: this.nextId('w'), from, to };
    this.wires.set(wire.id, wire);
    this.topoVersion += 1;
    return wire;
  }

  removeWire(wireId: string): void {
    if (this.wires.delete(wireId)) this.topoVersion += 1;
  }

  getNode(nodeId: string): CircuitNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Avança o estado de um nó `input` no ciclo OFF → ON → CLK → OFF: desligado,
   * ligado (estático) e modo clock (oscila com o tempo). No-op para outros tipos.
   * No modo CLK o `value` estático é zerado — a saída passa a derivar do tempo.
   */
  cycleInputState(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'input') return;
    if (node.clock) {
      // CLK → OFF
      node.clock = false;
      node.value = false;
    } else if (node.value) {
      // ON → CLK
      node.value = false;
      node.clock = true;
    } else {
      // OFF → ON
      node.value = true;
    }
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
